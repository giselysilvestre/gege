export function isKapsoConfigured() {
  const key = process.env.KAPSO_API_KEY?.trim();
  const phoneId = process.env.KAPSO_PHONE_NUMBER_ID?.trim();
  return Boolean(key && phoneId && key.length > 8 && phoneId.length > 5);
}
