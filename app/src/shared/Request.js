import { ip } from '@/shared/config'
import { store } from '@/store'
import axios from 'axios'

/**
 * @description: 
 * @param {*} url
 * @param {*} method default GET
 * @param {*} params String(stringified JSON)/FormData/Object. Object cannot handle multiple files with single key, use FormData in this case.
 * @return {*}
 */
export async function request(url, method, params, progressOptions) {
    let options = {
        url,
        baseURL: ip,
        withCredentials: true,
        headers: {},
    }
    if (progressOptions) {
        if (!progressOptions.hasOwnProperty('upload')) console.log(`ERR[Request]: UPLOAD is required for progresssOptions`)
        const uploadFunc = e => {
            progressOptions.progress.per = Math.round(e.loaded / e.total * 100)
        }
        if (progressOptions.upload) options.onUploadProgress = uploadFunc
        else options.onDownloadProgress = uploadFunc
    }
    // set authorization
    const bearer = store.state.token
    if (bearer) {
        options.headers['Authorization'] = bearer
    }
    // set method
    options.method = method || 'GET'
    // set body
    if (params) {
        if (typeof params == 'string') {
            options.data = params
            options.headers['Content-Type'] = 'application/json'
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
    } catch (err) {
        const errCode = err.response.status
        return { ERRNO: errCode }
    }
}