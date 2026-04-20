require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function analisarConversa(candidatoId, eventos) {
  const mensatosCandidato = eventos
    .filter(e => e.direcao === 'inbound' && e.conteudo)
    .map(e => e.conteudo)
    .join('\n');

  if (!mensatosCandidato.trim()) return null;

  const prompt = `Você é um recrutador analisando respostas de um candidato em uma conversa de WhatsApp.
Abaixo estão as mensagens enviadas pelo candidato durante uma triagem. Extraia as informações e retorne APENAS JSON válido, sem markdown.

{
  "o_que_fazia": "o que o candidato fazia no último emprego ou null",
  "motivo_saida": "por que saiu do último emprego ou null",
  "o_que_gostava": "o que mais gostava no trabalho anterior ou null",
  "relacao_colegas": "como se relacionava com a equipe ou null",
  "objetivo_profissional": "o que busca na próxima oportunidade ou null",
  "significado_trabalho": "o que trabalho significa para ele ou null",
  "disponibilidade_horario": "turnos e dias disponíveis ou null",
  "composicao_familiar": "com quem mora, filhos, situação familiar ou null",
  "momento_profissional": "empregado, desempregado, em transição ou null",
  "situacao_emprego": "Empregado | Desempregado | null",
  "pontos_adicionais": "pontos positivos identificados na conversa que não estão no CV — comportamento, motivação, clareza de comunicação, ou null",
  "red_flags_adicionais": "alertas identificados na conversa — instabilidade, conflito, evasão de perguntas, ou null"
}

Se a informação não foi mencionada, retorna null para aquele campo.
Não inventa informações. Só extrai o que está explícito nas mensagens.

Mensagens do candidato:
"""
${mensatosCandidato}
"""`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error('[job] erro ao analisar conversa:', candidatoId, err.message);
    return null;
  }
}

async function rodarJob() {
  console.log('[job] iniciando análise diária —', new Date().toISOString());

  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  const { data: sessoes, error } = await supabase
    .from('whatsapp_sessoes')
    .select('id, candidato_id')
    .gte('ultima_inbound_at', inicioDia.toISOString());

  if (error) {
    console.error('[job] erro ao buscar sessões:', error);
    return;
  }

  console.log(`[job] ${sessoes.length} sessões com atividade hoje`);

  for (const sessao of sessoes) {
    const { data: eventos } = await supabase
      .from('whatsapp_eventos')
      .select('direcao, conteudo, criado_em')
      .eq('sessao_id', sessao.id)
      .order('criado_em', { ascending: true });

    if (!eventos?.length) continue;

    const dados = await analisarConversa(sessao.candidato_id, eventos);
    if (!dados) continue;

    const { data: analiseExistente } = await supabase
      .from('candidatos_analise')
      .select('*')
      .eq('candidato_id', sessao.candidato_id)
      .single();

    const update = {};
    const camposSimples = [
      'o_que_fazia', 'motivo_saida', 'o_que_gostava', 'relacao_colegas',
      'objetivo_profissional', 'significado_trabalho', 'disponibilidade_horario',
      'composicao_familiar', 'momento_profissional', 'situacao_emprego'
    ];

    for (const campo of camposSimples) {
      if (!dados[campo]) continue;
      if (!analiseExistente?.[campo]) {
        update[campo] = dados[campo];
      }
    }

    if (dados.pontos_adicionais) {
      if (analiseExistente?.pontos_fortes) {
        update.pontos_fortes = analiseExistente.pontos_fortes + '\n\nDa entrevista: ' + dados.pontos_adicionais;
      } else {
        update.pontos_fortes = dados.pontos_adicionais;
      }
    }

    if (dados.red_flags_adicionais) {
      if (analiseExistente?.red_flags) {
        update.red_flags = analiseExistente.red_flags + '\n\nDa entrevista: ' + dados.red_flags_adicionais;
      } else {
        update.red_flags = dados.red_flags_adicionais;
      }
    }

    if (Object.keys(update).length === 0) {
      console.log('[job] nada novo para candidato:', sessao.candidato_id);
      continue;
    }

    update.atualizado_em = new Date().toISOString();

    if (analiseExistente) {
      await supabase
        .from('candidatos_analise')
        .update(update)
        .eq('candidato_id', sessao.candidato_id);
    } else {
      await supabase
        .from('candidatos_analise')
        .insert({ candidato_id: sessao.candidato_id, ...update });
    }

    console.log('[job] salvo para candidato:', sessao.candidato_id, Object.keys(update));
  }

  console.log('[job] concluído —', new Date().toISOString());
}

rodarJob().catch(console.error);
