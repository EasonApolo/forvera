<template>
  <div class="title"></div>
  <div class="long"></div>
  <div class="long"></div>
  <div class="short"></div>
</template>

<style lang="less" scoped>
div {
  background-image: linear-gradient(
    90deg,
    #f6f6f6 25%,
    #eaeaea 37%,
    #f6f6f6 63%
  );
  background-size: 400% 100%;
  background-position: 100% 50%;
  animation: skeleton-loading 2s ease infinite;
  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
}
.title {
  width: 8rem;
  height: 1rem;
}
.long {
  width: 100%;
  height: 0.8rem;
}
.short {
  width: 70%;
  height: 0.6rem;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}
</style>
