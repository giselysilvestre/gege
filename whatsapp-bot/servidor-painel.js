require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function analisarCV(buffer, filename) {
  const hoje = new Date().toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
  let cvText = '';

  try {
    const parsed = await pdfParse(buffer);
    cvText = parsed.text.slice(0, 4000);
  } catch(e) {
    return { erro: 'Não foi possível extrair texto do PDF: ' + e.message };
  }

  const prompt = `A data de hoje é ${hoje}. Use como referência absoluta para calcular durações, identificar empregos atuais e avaliar se datas são passadas ou futuras.
Você é recrutador sênior em food service. Retorne APENAS JSON válido, sem markdown.
{
  "candidato": {
    "nome": "Capitalizar cada palavra exceto preposições",
    "telefone": "Formato +55 DD 9XXXX-XXXX ou null",
    "email": "minúsculo ou null",
    "cargo_principal": "cargo do último emprego ou null",
    "cidade": "apenas se explícito ou null",
    "bairro": "apenas se explícito ou null",
    "cep": "formato 00000-000 ou null",
    "escolaridade": "nível mais alto ou null",
    "genero": "Masculino | Feminino | Não informado",
    "data_nascimento": "YYYY-MM-DD se explícito ou null",
    "situacao_emprego": "Empregado | Desempregado | null"
  },
  "experiencias": [
    {
      "empresa": "nome da empresa",
      "cargo": "cargo ou null",
      "setor": "alimentacao | cozinha | atendimento | lideranca | outro",
      "data_inicio": "YYYY-MM-DD ou null",
      "data_fim": "YYYY-MM-DD ou null se atual",
      "meses": "número inteiro",
      "eh_lideranca": true,
      "crescimento_interno": false
    }
  ],
  "analise": {
    "perfil_resumo": "cargo + tempo de experiência relevante",
    "pontos_fortes": "texto corrido ou null",
    "red_flags": "texto corrido ou null",
    "fit_food_service": "Alto | Médio | Baixo",
    "analise_completa": "análise narrativa completa",
    "score_ia": 75,
    "ultima_experiencia": "Empresa — cargo, duração"
  }
}
CV:
"""${cvText}"""`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });
    const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch(e) {
    return { erro: 'Erro na análise IA: ' + e.message };
  }
}

async function salvarCandidato(dados) {
  const { candidato, experiencias, analise } = dados;

  let candidatoId = null;
  let operacao = 'criado';

  if (candidato.telefone) {
    const { data: existente } = await supabase
      .from('candidatos')
      .select('id')
      .ilike('telefone', '%' + candidato.telefone.replace(/\D/g, '').slice(-8) + '%')
      .single();
    if (existente) {
      candidatoId = existente.id;
      operacao = 'atualizado';
    }
  }

  const dadosCandidato = {
    nome: candidato.nome,
    telefone: candidato.telefone,
    email: candidato.email,
    cargo_principal: candidato.cargo_principal,
    cidade: candidato.cidade,
    bairro: candidato.bairro,
    cep: candidato.cep,
    escolaridade: candidato.escolaridade,
    genero: candidato.genero,
    data_nascimento: candidato.data_nascimento,
    situacao_emprego: candidato.situacao_emprego,
    disponivel: true,
    origem: 'upload_painel',
    atualizado_em: new Date().toISOString()
  };

  if (candidatoId) {
    await supabase.from('candidatos').update(dadosCandidato).eq('id', candidatoId);
  } else {
    const { data: novo } = await supabase.from('candidatos').insert({ ...dadosCandidato, criado_em: new Date().toISOString() }).select('id').single();
    candidatoId = novo.id;
  }

  if (experiencias?.length > 0) {
    await supabase.from('candidatos_experiencia').delete().eq('candidato_id', candidatoId);
    await supabase.from('candidatos_experiencia').insert(
      experiencias.map(e => ({
        candidato_id: candidatoId,
        empresa: e.empresa,
        cargo: e.cargo,
        setor: e.setor,
        data_inicio: e.data_inicio,
        data_fim: e.data_fim,
        meses: e.meses,
        eh_lideranca: e.eh_lideranca === true || e.eh_lideranca === 'true',
        crescimento_interno: e.crescimento_interno === true || e.crescimento_interno === 'true',
        criado_em: new Date().toISOString()
      }))
    );
  }

  const analiseData = {
    candidato_id: candidatoId,
    perfil_resumo: analise.perfil_resumo,
    pontos_fortes: analise.pontos_fortes,
    red_flags: analise.red_flags,
    fit_food_service: analise.fit_food_service,
    analise_completa: analise.analise_completa,
    score_ia: parseInt(analise.score_ia, 10) || null,
    ultima_experiencia: analise.ultima_experiencia,
    modelo_usado: 'claude-sonnet-4-20250514',
    processado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  const { data: analiseExistente } = await supabase.from('candidatos_analise').select('id').eq('candidato_id', candidatoId).single();
  if (analiseExistente) {
    await supabase.from('candidatos_analise').update(analiseData).eq('candidato_id', candidatoId);
  } else {
    await supabase.from('candidatos_analise').insert({ ...analiseData, criado_em: new Date().toISOString() });
  }

  return { candidatoId, operacao };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const html = fs.readFileSync(path.join(__dirname, 'painel-cvs.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'POST' && req.url === '/processar') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks);
        const boundary = req.headers['content-type'].split('boundary=')[1];
        const parts = body.toString('binary').split('--' + boundary);
        const results = [];

        for (const part of parts) {
          if (!part.includes('filename=')) continue;
          const filenameMatch = part.match(/filename="([^"]+)"/);
          const filename = filenameMatch ? filenameMatch[1] : 'arquivo.pdf';
          if (!filename.endsWith('.pdf')) continue;
          const headerEnd = part.indexOf('\r\n\r\n');
          const fileContent = Buffer.from(part.slice(headerEnd + 4, part.lastIndexOf('\r\n')), 'binary');
          const dados = await analisarCV(fileContent, filename);
          if (dados.erro) {
            results.push({ filename, erro: dados.erro });
          } else {
            const { candidatoId, operacao } = await salvarCandidato(dados);
            results.push({ filename, candidatoId, operacao, nome: dados.candidato.nome, cargo: dados.candidato.cargo_principal, score: dados.analise.score_ia, fit: dados.analise.fit_food_service });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ erro: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(4444, () => console.log('Painel CVs rodando em http://localhost:4444'));
