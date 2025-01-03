import { ip as baseURL } from '../config'
import axios, { AxiosRequestConfig, Method } from 'axios'
import { useUserStore } from '../store/user'
import { useMainStore } from '../store/main'
import { useToastStore } from '../store/toast'

type RequestOptions = {
  withCredentials?: boolean
  contentType?: 'json' | 'formData'
}

/**
 * @description:
 * @param {*} url
 * @param {*} method default GET
 * @param {*} params String(stringified JSON)/FormData/Object. Object cannot handle multiple files with single key, use FormData in this case.
 * @return {*}
 */
export async function request(
  url: string,
  method: Method = 'get',
  params?: any,
  requestOptions?: RequestOptions
) {
  const userStore = useUserStore()
  let options: AxiosRequestConfig = {
    url,
    baseURL,
    withCredentials: requestOptions?.withCredentials ?? true,
    headers: {},
    method,
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
  if (options.withCredentials) {
    const bearer = userStore.userInfo.token
    if (bearer) {
      options.headers!['Authorization'] = bearer
    }
  }

  // set body
  if (params) {
    if (method.toLowerCase() === 'get') {
      const queryString = new URLSearchParams(params).toString()
      url += url.includes('?') ? `&${queryString}` : `?${queryString}`
      options.url = url
    } else {
      if (typeof params == 'string') {
        options.data = params
        options.headers!['Content-Type'] = 'application/json'
      } else if (params instanceof FormData) {
        options.data = params
      } else if (requestOptions?.contentType === 'formData') {
        let formData = new FormData()
        for (let key in params) {
          formData.append(key, params[key])
        }
        options.data = formData
      } else {
        options.data = JSON.stringify(params)
        options.headers!['Content-Type'] = 'application/json'
      }
    }
  }

  try {
    const res = await axios(options)
    return res.data
  } catch (err: any) {
    const toastStore = useToastStore()
    if (err.message === 'Network Error') {
      toastStore.showToast({
        content: '网络错误，可能是后台挂了～',
        type: '!',
        timeout: 3000,
      })
    } else {
      const errCode = err.response.status
      if (errCode === 401) {
        if (userStore.isLogin) {
          toastStore.showToast({
            content: '登录凭证已过期，请保存后点击个人重新登录。',
            type: '!',
            timeout: 3000,
          })
        }
        userStore.logout()
      } else {
        toastStore.showToast({
          content: err.response.data.message || errCode,
          type: '!',
          timeout: 3000,
        })
      }
    }
    throw err
  }
}
