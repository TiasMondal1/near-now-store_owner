/**
 * Environment variable validation
 * Ensures all required environment variables are present before app starts
 */

interface EnvConfig {
  EXPO_PUBLIC_API_BASE_URL: string;
  EXPO_PUBLIC_SUPABASE_URL: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required variables — mapped to statically-referenced process.env reads
  // (not process.env[key]) since Expo's bundler inlines EXPO_PUBLIC_* vars by
  // matching the literal `process.env.NAME` expression at build time; a
  // dynamic/computed access can't be statically analyzed and silently never
  // gets replaced, which is exactly the class of bug this validator exists
  // to catch — it shouldn't itself rely on the pattern it's guarding against.
  const requiredValues: Record<string, string | undefined> = {
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };
  const required = Object.keys(requiredValues);

  // Optional but recommended
  const optionalValues: Record<string, string | undefined> = {
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  };
  const optional = Object.keys(optionalValues);

  // Check required variables
  required.forEach((key) => {
    const value = requiredValues[key];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${key}`);
    } else {
      // Validate format
      if (key === 'EXPO_PUBLIC_API_BASE_URL') {
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          errors.push(`${key} must start with http:// or https://`);
        }
      }
      if (key === 'EXPO_PUBLIC_SUPABASE_URL') {
        if (!value.startsWith('https://')) {
          errors.push(`${key} must start with https://`);
        }
        if (!value.includes('supabase.co')) {
          warnings.push(`${key} doesn't appear to be a valid Supabase URL`);
        }
      }
      if (key === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') {
        if (value.length < 100) {
          warnings.push(`${key} appears to be too short for a valid Supabase key`);
        }
      }
    }
  });

  // Check optional variables
  optional.forEach((key) => {
    const value = optionalValues[key];
    if (!value || value.trim() === '') {
      warnings.push(`Optional environment variable not set: ${key}`);
    }
  });

  // Production-specific checks
  if (process.env.NODE_ENV === 'production') {
    const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL || '';
    if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1') || apiUrl.includes('192.168')) {
      errors.push('Production build cannot use localhost/local IP for API_BASE_URL');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function logEnvironmentStatus(): void {
  const result = validateEnvironment();

  console.log('=== Environment Validation ===');
  
  if (result.isValid) {
    console.log('✅ All required environment variables are set');
  } else {
    console.error('❌ Environment validation failed:');
    result.errors.forEach((error) => console.error(`  - ${error}`));
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️ Warnings:');
    result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  console.log('==============================');
}

export function getValidatedEnv(): EnvConfig {
  const result = validateEnvironment();
  
  if (!result.isValid) {
    throw new Error(
      `Environment validation failed:\n${result.errors.join('\n')}\n\nPlease check your .env file.`
    );
  }

  return {
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL!,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL!,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  };
}
