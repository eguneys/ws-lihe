import { username, gen8 } from './username'

export type UserDoc = {
  username: string
}

export type UserId = `u${string}`
export class User {

  static newUser = () => {
    let res = new User(`u${gen8()}`, username())
    res.newly_created = true
    return res
  }

  static from_doc = (id: UserId, doc: UserDoc) => {
    return new User(id, doc.username)
  }

  get doc() {
    return {
      username: this.username
    }
  }

  newly_created?: true

  constructor(readonly id: UserId,
              readonly username: string) {
  }
}


export type VsDoc = {
}

export type VsId = `v${string}`
export class Vs {

  static newVs = () => {
    let res = new Vs(`v${gen8()}`)
    return res
  }


  static from_doc = (id: VsId, doc: VsDoc) => {
    return new Vs(id)
  }

  constructor(readonly id: VsId) {}

  get doc() {
    return {
    }
  }
}
