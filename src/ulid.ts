// Adapted from https://github.com/perry-mitchell/ulidx for use with Browsers,
// Cloudflare Workers, Durable Objects, and Node.js

export type ULID = string
export type ULIDFactoryArgs = {
  monotonic?: boolean
}
export type ULIDFactory = (timestamp?: number) => ULID

// These values should NEVER change. The values are precisely for
// generating ULIDs.
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford's Base32
const ENCODING_LEN = ENCODING.length
const TIME_MAX = Math.pow(2, 48) - 1
const TIME_LEN = 10
const RANDOM_LEN = 16

// Use appropriate random number generation based on the environment
function secureRandom(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint8Array(1)
    crypto.getRandomValues(buffer)
    return buffer[0] / 0xff
  } else {
    // Fallback for environments without crypto
    return Math.random()
  }
}

function encodeRandom(len: number): string {
  let str = ''
  for (; len > 0; len--) {
    str = randomChar() + str
  }
  return str
}

function validateTimestamp(timestamp: number): void {
  if (isNaN(timestamp)) {
    throw new Error(`timestamp must be a number: ${timestamp}`)
  } else if (timestamp > TIME_MAX) {
    throw new Error(`cannot encode a timestamp larger than 2^48 - 1 (${TIME_MAX}) : ${timestamp}`)
  } else if (timestamp < 0) {
    throw new Error(`timestamp must be positive: ${timestamp}`)
  } else if (Number.isInteger(timestamp) === false) {
    throw new Error(`timestamp must be an integer: ${timestamp}`)
  }
}

export function encodeTime(timestamp: number): string {
  validateTimestamp(timestamp)

  let mod: number
  let str: string = ''

  for (let tLen: number = TIME_LEN; tLen > 0; tLen--) {
    mod = timestamp % ENCODING_LEN
    str = ENCODING.charAt(mod) + str
    timestamp = (timestamp - mod) / ENCODING_LEN
  }

  return str
}

function incrementBase32(str: string): string {
  let done: string | undefined = undefined,
    index = str.length,
    char: string,
    charIndex: number,
    output = str
  const maxCharIndex = ENCODING_LEN - 1

  if (str.length > RANDOM_LEN) {
    throw new Error(`Base32 value to increment cannot be longer than ${RANDOM_LEN} characters`)
  }

  if (str === 'Z'.repeat(RANDOM_LEN)) {
    throw new Error(`Cannot increment Base32 maximum value ${'Z'.repeat(RANDOM_LEN)}`)
  }

  while (!done && index-- >= 0) {
    char = output[index]
    charIndex = ENCODING.indexOf(char)
    if (charIndex === -1) {
      throw new Error('Incorrectly encoded string')
    }
    if (charIndex === maxCharIndex) {
      output = replaceCharAt(output, index, ENCODING[0])
      continue
    }
    done = replaceCharAt(output, index, ENCODING[charIndex + 1])
  }
  if (typeof done === 'string') {
    return done
  }
  throw new Error('Failed incrementing string')
}

function randomChar(): string {
  let rand = Math.floor(secureRandom() * ENCODING_LEN)
  if (rand === ENCODING_LEN) {
    rand = ENCODING_LEN - 1
  }
  return ENCODING.charAt(rand)
}

function replaceCharAt(str: string, index: number, char: string): string {
  if (index > str.length - 1) {
    return str
  }
  return str.substring(0, index) + char + str.substring(index + 1)
}

export function decodeTime(id: string): number {
  if (id.length !== TIME_LEN + RANDOM_LEN) {
    throw new Error('Malformed ULID')
  }

  const time = id
    .substring(0, TIME_LEN)
    .split('')
    .reverse()
    .reduce((carry, char, index) => {
      const encodingIndex = ENCODING.indexOf(char)
      if (encodingIndex === -1) {
        throw new Error(`Time decode error: Invalid character: ${char}`)
      }
      return (carry += encodingIndex * Math.pow(ENCODING_LEN, index))
    }, 0)

  if (time > TIME_MAX) {
    throw new Error(`Malformed ULID: timestamp too large: ${time}`)
  }

  return time
}

export const ulidFactory = (args?: ULIDFactoryArgs): ULIDFactory => {
  const monotonic = args?.monotonic ?? true

  if (monotonic) {
    return (function () {
      let lastTime: number = 0
      let lastRandom: string
      return function (timestamp?: number): ULID {
        let timestampOrNow: number = timestamp || Date.now()
        validateTimestamp(timestampOrNow)

        if (timestampOrNow > lastTime) {
          lastTime = timestampOrNow
          const random = encodeRandom(RANDOM_LEN)
          lastRandom = random
          return encodeTime(timestampOrNow) + random
        } else {
          // <= lastTime : increment lastRandom
          const random = incrementBase32(lastRandom)
          lastRandom = random
          return encodeTime(lastTime) + random
        }
      }
    })()
  } else {
    return (function () {
      return function (timestamp?: number): ULID {
        let timestampOrNow: number = timestamp || Date.now()
        validateTimestamp(timestampOrNow)
        return encodeTime(timestampOrNow) + encodeRandom(RANDOM_LEN)
      }
    })()
  }
}

export const ulid: ULIDFactory = ulidFactory()
