# Docker images containing build tooling

## Helper scripts
>  ./scripts/mk.debian
  * build local debian image
  * default variant: VARIANT_VERSION=**Buster**
  * default platform: PLATFORM=**linux/arm64**
  * default architecture:  ARCH=**aarch64**
> ./scripts/mk.debian.rebuild
  * same as mk.debian plus pull new base and ignore docker build cache

### Example
Build **Bullseye** image for x86 64bit:
> PLATFORM=linux/amd64  ARCH=x86_84  VARIANT_VERSION=bullseye  ./scripts/mk.debian
