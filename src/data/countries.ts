// Copied from frontend/src/data/countries.ts (independent copy). Seeds the admin shipping / tax settings and address formats.
// Country, address-format and shipping-zone configuration (illustrative demo data).
// Phase 2: the backend should own shipping zones, rates and tax rules; keep this shape for the API response.

export type ShippingZoneId = 'domestic' | 'asia' | 'europe' | 'north_america' | 'oceania';

export type RegionLabel = 'state' | 'province' | 'county' | 'prefecture' | 'emirate' | 'stateTerritory' | 'region';
export type PostalLabel = 'zip' | 'postcode' | 'pinCode' | 'postalCode' | 'eircode';
export type CityLabel = 'city' | 'townCity' | 'suburb';

export interface AddressFormat {
  cityLabel: CityLabel;
  cityRequired: boolean;
  region: null | { label: RegionLabel; required: boolean; options?: string[] };
  postal: null | { label: PostalLabel; required: boolean; pattern: RegExp; example: string };
}

export interface CountryConfig {
  code: string;
  name: string; // English fallback; UI uses Intl.DisplayNames for the active language
  dialCode: string;
  zone: ShippingZoneId | null; // null = we don't ship there yet
  /** Illustrative tax/VAT rate used for the demo estimate only. */
  demoTaxRate: number;
  format: AddressFormat;
}

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
  'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
  'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

const IN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const CA_PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories',
  'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon',
];

const AU_STATES = [
  'Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland', 'South Australia', 'Tasmania',
  'Victoria', 'Western Australia',
];

const AE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras Al Khaimah', 'Sharjah', 'Umm Al Quwain'];

const generic: AddressFormat = {
  cityLabel: 'city',
  cityRequired: true,
  region: { label: 'region', required: false },
  postal: { label: 'postalCode', required: false, pattern: /^[A-Za-z0-9 -]{2,10}$/, example: '' },
};

const fiveDigit = (label: PostalLabel, example: string): AddressFormat['postal'] => ({
  label,
  required: true,
  pattern: /^\d{5}$/,
  example,
});

export const COUNTRIES: CountryConfig[] = [
  {
    code: 'IN', name: 'India', dialCode: '+91', zone: 'domestic', demoTaxRate: 0.12,
    format: {
      cityLabel: 'city', cityRequired: true,
      region: { label: 'state', required: true, options: IN_STATES },
      postal: { label: 'pinCode', required: true, pattern: /^[1-9]\d{5}$/, example: '302001' },
    },
  },
  {
    code: 'US', name: 'United States', dialCode: '+1', zone: 'north_america', demoTaxRate: 0.07,
    format: {
      cityLabel: 'city', cityRequired: true,
      region: { label: 'state', required: true, options: US_STATES },
      postal: { label: 'zip', required: true, pattern: /^\d{5}(-\d{4})?$/, example: '94107' },
    },
  },
  {
    code: 'CA', name: 'Canada', dialCode: '+1', zone: 'north_america', demoTaxRate: 0.13,
    format: {
      cityLabel: 'city', cityRequired: true,
      region: { label: 'province', required: true, options: CA_PROVINCES },
      postal: { label: 'postalCode', required: true, pattern: /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/, example: 'M5V 2T6' },
    },
  },
  {
    code: 'GB', name: 'United Kingdom', dialCode: '+44', zone: 'europe', demoTaxRate: 0.2,
    format: {
      cityLabel: 'townCity', cityRequired: true,
      region: { label: 'county', required: false },
      postal: { label: 'postcode', required: true, pattern: /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/, example: 'SW1A 1AA' },
    },
  },
  {
    code: 'IE', name: 'Ireland', dialCode: '+353', zone: 'europe', demoTaxRate: 0.23,
    format: {
      cityLabel: 'townCity', cityRequired: true,
      region: { label: 'county', required: true },
      postal: { label: 'eircode', required: false, pattern: /^[A-Za-z]\d[\dWw] ?[A-Za-z\d]{4}$/, example: 'D02 X285' },
    },
  },
  { code: 'DE', name: 'Germany', dialCode: '+49', zone: 'europe', demoTaxRate: 0.19, format: { cityLabel: 'city', cityRequired: true, region: null, postal: fiveDigit('postalCode', '10115') } },
  { code: 'FR', name: 'France', dialCode: '+33', zone: 'europe', demoTaxRate: 0.2, format: { cityLabel: 'city', cityRequired: true, region: null, postal: fiveDigit('postalCode', '75001') } },
  { code: 'ES', name: 'Spain', dialCode: '+34', zone: 'europe', demoTaxRate: 0.21, format: { cityLabel: 'city', cityRequired: true, region: { label: 'province', required: false }, postal: fiveDigit('postalCode', '28013') } },
  { code: 'IT', name: 'Italy', dialCode: '+39', zone: 'europe', demoTaxRate: 0.22, format: { cityLabel: 'city', cityRequired: true, region: { label: 'province', required: false }, postal: fiveDigit('postalCode', '00184') } },
  {
    code: 'NL', name: 'Netherlands', dialCode: '+31', zone: 'europe', demoTaxRate: 0.21,
    format: { cityLabel: 'city', cityRequired: true, region: null, postal: { label: 'postalCode', required: true, pattern: /^\d{4} ?[A-Za-z]{2}$/, example: '1012 AB' } },
  },
  {
    code: 'AU', name: 'Australia', dialCode: '+61', zone: 'oceania', demoTaxRate: 0.1,
    format: {
      cityLabel: 'suburb', cityRequired: true,
      region: { label: 'stateTerritory', required: true, options: AU_STATES },
      postal: { label: 'postcode', required: true, pattern: /^\d{4}$/, example: '2000' },
    },
  },
  {
    code: 'NZ', name: 'New Zealand', dialCode: '+64', zone: 'oceania', demoTaxRate: 0.15,
    format: { cityLabel: 'townCity', cityRequired: true, region: { label: 'region', required: false }, postal: { label: 'postcode', required: true, pattern: /^\d{4}$/, example: '6011' } },
  },
  {
    code: 'JP', name: 'Japan', dialCode: '+81', zone: 'asia', demoTaxRate: 0.1,
    format: { cityLabel: 'city', cityRequired: true, region: { label: 'prefecture', required: true }, postal: { label: 'postalCode', required: true, pattern: /^\d{3}-?\d{4}$/, example: '100-0001' } },
  },
  {
    code: 'SG', name: 'Singapore', dialCode: '+65', zone: 'asia', demoTaxRate: 0.09,
    format: { cityLabel: 'city', cityRequired: false, region: null, postal: { label: 'postalCode', required: true, pattern: /^\d{6}$/, example: '018956' } },
  },
  {
    code: 'AE', name: 'United Arab Emirates', dialCode: '+971', zone: 'asia', demoTaxRate: 0.05,
    format: { cityLabel: 'city', cityRequired: true, region: { label: 'emirate', required: true, options: AE_EMIRATES }, postal: null },
  },
  {
    code: 'HK', name: 'Hong Kong', dialCode: '+852', zone: 'asia', demoTaxRate: 0,
    format: { cityLabel: 'city', cityRequired: false, region: { label: 'region', required: true, options: ['Hong Kong Island', 'Kowloon', 'New Territories'] }, postal: null },
  },
  // Destinations the demo store does not ship to yet (shows the unsupported-destination state).
  { code: 'BR', name: 'Brazil', dialCode: '+55', zone: null, demoTaxRate: 0, format: generic },
  { code: 'MX', name: 'Mexico', dialCode: '+52', zone: null, demoTaxRate: 0, format: generic },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', zone: null, demoTaxRate: 0, format: generic },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', zone: null, demoTaxRate: 0, format: generic },
];

export const COUNTRY_BY_CODE: Record<string, CountryConfig> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string | undefined | null): CountryConfig | undefined {
  return code ? COUNTRY_BY_CODE[code] : undefined;
}

export interface ShippingRate {
  /** Base-currency (USD) minor units. */
  price: number;
  minDays: number;
  maxDays: number;
}

/** Illustrative shipping rates (USD cents) and transit times in business days. */
export const SHIPPING_ZONES: Record<ShippingZoneId, { standard: ShippingRate; express: ShippingRate }> = {
  domestic: { standard: { price: 300, minDays: 3, maxDays: 6 }, express: { price: 900, minDays: 1, maxDays: 3 } },
  asia: { standard: { price: 1200, minDays: 7, maxDays: 12 }, express: { price: 2600, minDays: 3, maxDays: 6 } },
  europe: { standard: { price: 1400, minDays: 8, maxDays: 14 }, express: { price: 2900, minDays: 4, maxDays: 7 } },
  north_america: { standard: { price: 1500, minDays: 8, maxDays: 15 }, express: { price: 3200, minDays: 4, maxDays: 7 } },
  oceania: { standard: { price: 1600, minDays: 9, maxDays: 16 }, express: { price: 3400, minDays: 5, maxDays: 8 } },
};
