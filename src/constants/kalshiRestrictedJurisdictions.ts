/**
 * Kalshi Restricted Jurisdictions per the Kalshi Member Agreement (Section VI).
 * Users domiciled, organized, or located in these jurisdictions are prohibited
 * from accessing, using, or trading on the Platform.
 * Source: kalshi-member-agreement.pdf
 *
 * Stored as ISO 3166-1 alpha-2 country codes for IP geolocation matching.
 */
export const KALSHI_RESTRICTED_COUNTRY_CODES = new Set([
  "AF", // Afghanistan
  "DZ", // Algeria
  "AO", // Angola
  "AU", // Australia
  "BY", // Belarus
  "BE", // Belgium
  "BO", // Bolivia
  "BG", // Bulgaria
  "BF", // Burkina Faso
  "CM", // Cameroon
  "CA", // Canada
  "CF", // Central African Republic
  "CI", // Côte d'Ivoire
  "CU", // Cuba
  "CD", // Democratic Republic of the Congo
  "ET", // Ethiopia
  "FR", // France
  "HT", // Haiti
  "IR", // Iran
  "IQ", // Iraq
  "IT", // Italy
  "KE", // Kenya
  "LA", // Laos
  "LB", // Lebanon
  "LY", // Libya
  "ML", // Mali
  "MC", // Monaco
  "MZ", // Mozambique
  "MM", // Myanmar (Burma)
  "NA", // Namibia
  "NI", // Nicaragua
  "NE", // Niger
  "KP", // North Korea
  "CN", // People's Republic of China
  "PL", // Poland
  "RU", // Russia
  "SG", // Singapore
  "SO", // Somalia
  "SS", // South Sudan
  "SD", // Sudan
  "CH", // Switzerland
  "SY", // Syria
  "TW", // Taiwan
  "TH", // Thailand
  "UA", // Ukraine
  "AE", // United Arab Emirates
  "GB", // United Kingdom
  "VE", // Venezuela
  "YE", // Yemen
  "ZW", // Zimbabwe
]);

/**
 * US comprehensive sanctions (OFAC-style) country codes.
 * "Any jurisdiction or territory that is the subject of comprehensive
 * country-wide, territory-wide, or regional economic sanctions imposed by the United States."
 * Includes common OFAC comprehensively sanctioned jurisdictions.
 */
export const US_SANCTIONS_COUNTRY_CODES = new Set([
  "IR", // Iran
  "KP", // North Korea
  "SY", // Syria
  "CU", // Cuba
  "RU", // Russia (certain regions; often treated as restricted)
  "BY", // Belarus
  // Add others as needed per OFAC SDN list
]);

export function isKalshiRestrictedCountry(countryCode: string): boolean {
  const code = countryCode?.toUpperCase?.().trim();
  if (!code || code.length !== 2) return false;
  return KALSHI_RESTRICTED_COUNTRY_CODES.has(code);
}
