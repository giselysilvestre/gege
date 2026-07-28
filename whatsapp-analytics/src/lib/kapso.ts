import { isKapsoConfigured } from "@/lib/kapsoConfig";

export async function sendKapsoText(toDigits: string, message: string) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID?.trim();
  const apiKey = process.env.KAPSO_API_KEY?.trim();

  if (!isKapsoConfigured() || !apiKey || !phoneNumberId) {
    throw new Error(
      "Envio manual: adicione KAPSO_API_KEY e KAPSO_PHONE_NUMBER_ID em whatsapp-analytics/.env.local (mesmos valores do whatsapp-bot) e reinicie npm run dev."
    );
  }

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits.replace(/\D/g, ""),
      type: "text",
      text: { body: message },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kapso ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    messages?: { id?: string }[];
  };
  const kapsoMessageId = json?.messages?.[0]?.id ?? null;
  return { kapsoMessageId, raw: json };
}

export function conteudoLogTemplate(templateName: string) {
  if (templateName === "fup_mensagem") {
    return "[template:fup_mensagem] oiii, não esquece de me responder?";
  }
  return `[template:${templateName}]`;
}

export async function sendKapsoTemplate(
  toDigits: string,
  templateName: string,
  params?: { nome?: string; cargo?: string }
) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID?.trim();
  const apiKey = process.env.KAPSO_API_KEY?.trim();

  if (!isKapsoConfigured() || !apiKey || !phoneNumberId) {
    throw new Error(
      "Envio manual: adicione KAPSO_API_KEY e KAPSO_PHONE_NUMBER_ID em whatsapp-analytics/.env.local (mesmos valores do whatsapp-bot) e reinicie npm run dev."
    );
  }

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: "pt_BR" },
  };
  if (templateName === "abordagem_candidatura_gege") {
    template.components = [
      {
        type: "body",
        parameters: [
          { type: "text", text: params?.nome ?? "candidato" },
          { type: "text", text: params?.cargo ?? "vaga" },
        ],
      },
    ];
  }

  return postKapsoTemplate(toDigits, template, phoneNumberId, apiKey);
}

/** Template Meta com parâmetros nomeados ({{nome}}, {{cliente}}, …). */
export async function sendKapsoTemplateNamedParams(
  toDigits: string,
  templateName: string,
  namedParams: { parameter_name: string; text: string }[]
) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID?.trim();
  const apiKey = process.env.KAPSO_API_KEY?.trim();

  if (!isKapsoConfigured() || !apiKey || !phoneNumberId) {
    throw new Error(
      "Envio manual: adicione KAPSO_API_KEY e KAPSO_PHONE_NUMBER_ID em whatsapp-analytics/.env.local (mesmos valores do whatsapp-bot) e reinicie npm run dev."
    );
  }

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: "pt_BR" },
  };
  if (namedParams.length > 0) {
    template.components = [
      {
        type: "body",
        parameters: namedParams.map(({ parameter_name, text }) => ({
          type: "text",
          parameter_name,
          text,
        })),
      },
    ];
  }

  return postKapsoTemplate(toDigits, template, phoneNumberId, apiKey);
}

async function postKapsoTemplate(
  toDigits: string,
  template: Record<string, unknown>,
  phoneNumberId: string,
  apiKey: string
) {
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits.replace(/\D/g, ""),
      type: "template",
      template,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kapso ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    messages?: { id?: string }[];
  };
  const kapsoMessageId = json?.messages?.[0]?.id ?? null;
  return { kapsoMessageId, raw: json };
}

export function normalizarTelefone(raw: string) {
  return raw.replace(/\D/g, "");
}
