import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { User } from './model'

const app = initializeApp()

const db = getFirestore()

class Fire {

  
  async addUser(user: User) {
    const usersRef = db.collection('users').doc(user.doc.id)
    return usersRef.set(user.doc)
  }

}

export default new Fire()
