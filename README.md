# Docker images containing build tooling

## CI Generated Images
The CI job for this repo will generate tooling images with cross compilers
targetting aarch64 and x86_64 for both linux/amd64 and linux/arm64
platforms.

Images are pushed by default by jobs on the main branch. Images on other
branches can be pushed by setting the PUBLISH_GCR_IMAGE and/or
PUBLISH_DOCKER_IMAGE params on the Jenkins build job

### Image Tagging

On all branches the image tags are appended with the git sha of the current
revision. On main an additional tag without the trailing sha is also pushed

## Helper scripts
>  ./scripts/mk.debian
  * build local debian image
  * default variant: VARIANT_VERSION=**Buster**
  * default platform: host arch
  * default cross compiler target architecture: aarch64 and x86_64
> ./scripts/mk.debian.rebuild
  * same as mk.debian plus pull new base and ignore docker build cache

### Example Command
Build **Bullseye** image for x86 64bit arch:
> PLATFORM=linux/amd64  ARCH=x86_64  VARIANT_VERSION=bullseye  ./scripts/mk.debian
