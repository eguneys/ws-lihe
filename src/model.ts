import { username, gen8 } from './username'

export type UserId = `u${string}`
export class User {

  static newUser = () => {
    return new User(`u${gen8()}`, username())
  }

  constructor(readonly userId: UserId,
              readonly username: string) {
  }

  get doc() {
    return {
      id: this.userId,
      name: this.username
    }
  }
}
