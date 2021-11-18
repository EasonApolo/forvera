import { ip as baseURL } from '../config'
import axios, { AxiosRequestConfig, Method } from 'axios'
import { useMainStore } from '../store/storeMain'

/**
 * @description: 
 * @param {*} url
 * @param {*} method default GET
 * @param {*} params String(stringified JSON)/FormData/Object. Object cannot handle multiple files with single key, use FormData in this case.
 * @return {*}
 */
export async function request(url: string, method: Method = 'get', params?: any, progressOptions?: any) {
  let options: AxiosRequestConfig = {
    url,
    baseURL,
    withCredentials: true,
    headers: {},
    method
  }
  // if (progressOptions) {
  //     if (!progressOptions.hasOwnProperty('upload')) console.log(`ERR[Request]: UPLOAD is required for progresssOptions`)
  //     const uploadFunc = e => {
  //         progressOptions.progress.per = Math.round(e.loaded / e.total * 100)
  //     }
  //     if (progressOptions.upload) options.onUploadProgress = uploadFunc
  //     else options.onDownloadProgress = uploadFunc
  // }
  // set authorization
  const mainStore = useMainStore()
  const bearer = mainStore.userInfo.token
  if (bearer) {
    options.headers!['Authorization'] = bearer
  }
  // set body
  if (params) {
    if (typeof params == 'string') {
      options.data = params
      options.headers!['Content-Type'] = 'application/json'
    } else if (params instanceof FormData) {
      options.data = params
    } else {
      let formData = new FormData()
      for (let key in params) {
        formData.append(key, params[key])
      }
      options.data = formData
    }
  }
  try {
    const res = await axios(options)
    return res.data
  } catch (err: any) {
    const errCode = err.response.status
    return { ERRNO: errCode }
  }
}