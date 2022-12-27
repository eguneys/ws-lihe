import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, CollectionReference } from 'firebase-admin/firestore'
import { User, UserId, UserDoc } from './model'
import { Vs, VsId, VsDoc } from './model'
const serviceAccount = require('../secrets/liheadsup.json')

const app = initializeApp({
  credential: cert(serviceAccount)
})

const db = getFirestore()

class Fire {

  users_coll!: CollectionReference
  vs_coll!: CollectionReference

  set env(env: string) {
    this.users_coll = db.collection('env').doc(env).collection('users')
    this.vs_coll = db.collection('env').doc(env).collection('vs')
  }
  
  async addUser(user: User) {
    const usersRef = this.users_coll.doc(user.id)
    return usersRef.set(user.doc).then(() => user)
  }


  async getUser(id: UserId) {
    const userRef = this.users_coll.doc(id)
    const doc = await userRef.get()
    if (doc.exists) {
      let data = doc.data()
      if (data) {
        return User.from_doc(id, data as UserDoc)
      }
    }
  }


  async addVs(vs: Vs) {
    const vsRef = this.vs_coll.doc(vs.id)
    return vsRef.set(vs.doc).then(() => vs)
  }


  async getVs(id: VsId) {
    const vsRef = this.vs_coll.doc(id)
    const doc = await vsRef.get()
    if (doc.exists) {
      let data = doc.data()
      if (data) {
        return Vs.from_doc(id, data as VsDoc)
      }
    }
  }
}

export default new Fire()
