import gocardless, { Environments } from 'gocardless-nodejs'

const token = process.env.GOCARDLESS_ACCESS_TOKEN!
const env = process.env.GOCARDLESS_ENVIRONMENT === 'live' ? Environments.Live : Environments.Sandbox

export const gc = gocardless(token, env)
