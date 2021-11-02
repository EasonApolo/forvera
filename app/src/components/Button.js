import styled from 'vue-styled-components'

const Padding = { 0: '.1rem .5rem', 1: '.2rem .625rem' }
const FontSize = { 0: .75, 1: .875}

const Button = styled('button', {
  size: { default: 1 },
  type: { defualt: undefined },
  mr: { default: 1 }
})`
  position: relative;
  display: inline-block;
  margin-right: ${ p => p.mr }rem;
  padding: ${ p => Padding[p.size] }
  line-height: 1.125rem;
  font-size: ${ p => `${ FontSize[p.size] }rem`}
  cursor: pointer;
  outline: none;
  user-select: none;
  overflow: hidden;
  border-radius: 1rem;
  border: none;
  color: white;
  background-color: ${ p => p.type ? p.theme.btn[p.type] : p.theme.btn.primary };
  transition: all .2s ease;
  transition-property: color, background-color;
  :hover {
    color: ${ p => p.theme.bg }
    background-color: ${ p => p.type ? p.theme.btn.hover[p.type] : p.theme.btn.hover.primary }
  }
`

const Progress = styled('div', {
  progress: { default: 0 }
})`
  position: absolute;
  left: 0;
  top: -1px;
  opacity: ${ p => p.progress/2+50 }%;
  width: ${ p => p.progress }%;
  height: 2px;
  background-color: ${ p => p.theme.btn.primary };
  transition: all .2s ease;
`

export { Button, Progress }