/** Country codes whose local numbers start with a 0 that is dropped after the country code. */
const TRUNK_ZERO = [
  '972',
  '970',
  '971',
  '966',
  '962',
  '961',
  '965',
  '974',
  '973',
  '968',
  '20',
  '212',
  '213',
  '216',
  '234',
  '254',
  '27',
  '44',
  '49',
  '33',
  '31',
  '32',
  '41',
  '43',
  '90',
  '380',
  '353',
  '61',
  '62',
  '63',
  '64',
  '66',
  '81',
  '82',
  '84',
  '86',
  '91',
  '92',
  '93',
  '94',
  '98',
  '880',
  '886',
];

/** "+972 055-248-1897" -> "+972552481897". Leaves numbers without a + alone apart from spacing. */
export function normalizePhone(input: string): string {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith('+')) return digits;
  const body = digits.slice(1);
  for (const cc of TRUNK_ZERO)
    if (body.startsWith(`${cc}0`) && body.length > cc.length + 8)
      return `+${cc}${body.slice(cc.length + 1)}`;
  return digits;
}
