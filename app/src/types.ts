interface Message {
  content: string
  created_time: string
  files: Array<File>
  level: number
  reactions: Array<number>
  user: UserInfo
  descendants: Array<Message>
  ancestor: string
  parent?: string
  _id: string
}

interface File {
  thumb: string
  url: string
  _id: string
}

interface UserInfo {
  _id: string
  username: string
}

interface Category {
  _id: string
  title: string
  description: string
}

interface Post {
  _id: string
  title: string
  description?: string
  content: string
  status: 0 | 1
  category: Array<string>
  updated_time: string
  created_time: string
  author: UserInfo
}

interface SelectedImage {
  blob: string
  file: File
}

interface FileDescriptor {
  _id: string
  url: string,
  thumb: string
}
