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

export const STRIPE_PRICE_ID = 'price_1TK2PB3SIXh5JMBkKSxuFyWE'
