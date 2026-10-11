const MAX_SIGNED_BIGINT = 9223372036854775807n;
const MIN_SIGNED_BIGINT = -9223372036854775808n;

const toExactMinorBigInt = (value) => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("Minor units must be an exact integer");
    }
    return BigInt(value);
  }
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)$/.test(value)) {
    throw new TypeError("Minor units must be an exact integer");
  }
  return BigInt(value);
};

export const parseDecimalToMinor = (value) => {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    throw new TypeError("Money must be a decimal string with at most two fractional digits");
  }

  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = negative ? -minor : minor;

  if (signed < MIN_SIGNED_BIGINT || signed > MAX_SIGNED_BIGINT) {
    throw new RangeError("Money exceeds the supported range");
  }

  if (negative && signed === 0n) {
    throw new TypeError("Negative zero is not allowed");
  }

  return signed.toString();
};

export const formatMinorAsDecimal = (value) => {
  const minor = toExactMinorBigInt(value);
  if (minor < MIN_SIGNED_BIGINT || minor > MAX_SIGNED_BIGINT) {
    throw new RangeError("Minor units exceed the signed BIGINT range");
  }
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
};

export const isPositiveMinor = (value) => toExactMinorBigInt(value) > 0n;
export const isNegativeMinor = (value) => toExactMinorBigInt(value) < 0n;
