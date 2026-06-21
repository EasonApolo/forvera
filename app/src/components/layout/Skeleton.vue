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
    var(--skeleton-base) 25%,
    var(--skeleton-highlight) 37%,
    var(--skeleton-base) 63%
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
  border-radius: 0.25rem;
}
.long {
  width: 100%;
  height: 0.8rem;
  border-radius: 0.25rem;
}
.short {
  width: 70%;
  height: 0.6rem;
  border-radius: 0.25rem;
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
