// d: a ISO date string
// ds: customized date string
export function parseISODate (d, options) {
  let ds = d.split(/[-T:]/)
  ds[0] = ds[0].slice(2, 4)
  ds = ds.slice(0, -1)
  ds = ds.slice(0,3).join('-') + ' ' + ds.slice(3,5).join(':')
  if (options.sec) ds += `:${ds.slice()}`
  return ds
}

export function getNowString (options={}) {
  let d = new Date()
  let y = d.getFullYear()
  if (options.fullYear) y = y.slice(2)
  let s = options.sec ? `:${ d.getSeconds() }` : ''
  return `${y}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}${s}`
}

export function readFile (file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.readAsDataURL(file)
  })
}