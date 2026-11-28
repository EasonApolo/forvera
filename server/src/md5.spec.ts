import { createHash } from 'crypto'
import { md5 } from 'shared/md5'

describe('md5', () => {
  it('matches node crypto for the login vectors', () => {
    const samples = ['', 'a', 'abc', 'anonymous', '密码 password', '😊']
    for (const sample of samples) {
      expect(md5(sample)).toBe(createHash('md5').update(sample).digest('hex'))
    }
  })
})
