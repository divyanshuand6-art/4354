const KNOWN_BOT_PATTERN = /bot|crawler|spider|preview|facebookexternalhit|slackbot|whatsapp|telegrambot|discordbot|linkedinbot|twitterbot|skypeuripreview|google-inspectiontool|curl\/|wget\/|python-requests|go-http-client|headlesschrome/i;

export function classifyPreliminary(userAgent = '') {
  if (!userAgent.trim()) return { botClass: 'unknown', isQualifiedClick: false, detectionReasons: ['missing_user_agent'] };
  if (KNOWN_BOT_PATTERN.test(userAgent)) return { botClass: 'known_bot', isQualifiedClick: false, detectionReasons: ['known_bot_user_agent'] };
  return { botClass: 'unknown', isQualifiedClick: false, detectionReasons: ['awaiting_worker_classification'] };
}

export async function classifyEvent(event, ClickEvent) {
  const ua = event.userAgent || '';
  if (!ua.trim()) return { botClass: 'unknown', isQualifiedClick: false, detectionReasons: ['missing_user_agent'] };
  if (KNOWN_BOT_PATTERN.test(ua)) return { botClass: 'known_bot', isQualifiedClick: false, detectionReasons: ['known_bot_user_agent'] };
  const since = new Date(event.clickedAt.getTime() - 60_000);
  const recentCount = await ClickEvent.countDocuments({ visitorHash: event.visitorHash, clickedAt: { $gte: since, $lte: event.clickedAt } });
  if (event.visitorHash && recentCount > 30) return { botClass: 'suspected_automation', isQualifiedClick: false, detectionReasons: ['high_request_frequency_60s'] };
  return { botClass: 'likely_human', isQualifiedClick: true, detectionReasons: ['no_automation_signals_detected'] };
}
