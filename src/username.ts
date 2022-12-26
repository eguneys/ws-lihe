import { faker } from '@faker-js/faker'
import slugify from 'slugify'

let opts = { replacement: '' }

export function username() {
  let color = faker.color.human()
  let cat = faker.animal.cat()
  let snake = faker.animal.snake()

  color = slugify(color, opts)
  cat = slugify(cat, opts)
  snake = slugify(snake, opts)

  if (Math.random() < 0.8) {
    color = color.slice(0, 1)
  }

  if (Math.random() < 0.2) {
    return (color + snake).slice(0, 16)
  }

  return (color + cat).slice(0, 16)
}
