// Shared between RegisterDto and ResetPasswordDto so the two can't drift —
// they previously had near-identical regexes, with reset-password.dto.ts
// carrying an extra unquantified character class that added no real
// constraint beyond the lookaheads already present.
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
export const PASSWORD_REGEX_MESSAGE =
  'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)';
