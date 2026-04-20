import Stripe from 'stripe'

let _stripe: Stripe | null = null

function getStripeInstance(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY ist nicht gesetzt')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
    })
  }
  return _stripe
}

// Lazy proxy – Stripe is only instantiated on first actual use (not at module load)
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripeInstance() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export function getStripePriceIdMonthly(): string {
  if (!process.env.STRIPE_PRICE_ID_MONTHLY) {
    throw new Error('STRIPE_PRICE_ID_MONTHLY ist nicht gesetzt')
  }
  return process.env.STRIPE_PRICE_ID_MONTHLY
}

export function getStripePriceIdYearly(): string {
  if (!process.env.STRIPE_PRICE_ID_YEARLY) {
    throw new Error('STRIPE_PRICE_ID_YEARLY ist nicht gesetzt')
  }
  return process.env.STRIPE_PRICE_ID_YEARLY
}
