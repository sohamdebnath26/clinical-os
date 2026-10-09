/**
 * Utility functions for date calculations in Clinical OS
 */

/**
 * Calculates accurate chronological age in completed years from an ISO date string (YYYY-MM-DD).
 * Returns empty string if invalid or empty.
 */
export function calculateAgeFromDOB(dobString: string): number | '' {
  if (!dobString || typeof dobString !== 'string') return '';
  
  // Format check YYYY-MM-DD
  const parts = dobString.split('-');
  if (parts.length !== 3) return '';

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';

  const birthDate = new Date(year, month, day);
  if (isNaN(birthDate.getTime())) return '';

  const today = new Date();
  
  // If birthdate is in the future
  if (birthDate > today) return 0;

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return Math.max(0, age);
}
