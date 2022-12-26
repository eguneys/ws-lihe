import { app } from './app'

function main() {
  let port: string = process.env.PORT ?? '3456'
  let env: string = process.env.NODE_ENV ?? 'development'


  app(parseInt(port), env)
}

main()
