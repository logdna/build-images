ARG BASE_IMAGE
ARG CROSS_COMPILER_TARGET_ARCH

# Image that runs natively on the BUILDPLATFORM to produce cross compile
# artifacts
FROM --platform=${BUILDPLATFORM} ${BASE_IMAGE} as build

SHELL ["/bin/bash", "-c"]

ARG TARGETARCH
ARG CROSS_COMPILER_TARGET_ARCH=x86_64
ARG SCCACHE_BUCKET
ARG SCCACHE_REGION
ARG SCCACHE_ENDPOINT
ARG SCCACHE_RECACHE
ARG SCCACHE_SERVER_PORT=4226

# Handly lookup env vars
ENV amd64=x86_64
ENV arm64=aarch64


RUN rustup target add "${!TARGETARCH}-unknown-linux-musl"  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

RUN dpkg --add-architecture ${TARGETARCH} && \
    apt-get update && apt-get install -y musl-dev:${TARGETARCH}

## Set up default cargo env vars for cross compiling
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=clang
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_AR=llvm-ar
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="-C link-args=-fuse-ld=lld -C link-args=--target=aarch64-unknown-linux-musl"
ENV CC_aarch64_unknown_linux_musl=clang
ENV CFLAGS_aarch64_unknown_linux_musl="-isystem /usr/include/aarch64-linux-musl"

## Set up default cargo env vars for cross compiling
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=clang
ENV CARGO_TARGET_86_64_UNKNOWN_LINUX_MUSL_AR=llvm-ar
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="-Clink-args=-fuse-ld=lld -Clink-args=--target=x86_64-unknown-linux-musl"
ENV CC_x86_64_unknown_linux_musl=clang
ENV CFLAGS_x86_64_unknown_linux_musl="-isystem /usr/include/x86_64-linux-musl"

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset RUSTC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    mkdir -p /tmp/tools && \
    cargo install --root /tmp/tools --target=${!TARGETARCH}-unknown-linux-musl flamegraph && \
    cargo install --root /tmp/tools --target=${!TARGETARCH}-unknown-linux-musl --version 0.6.3 cargo-cache && \
    sccache --show-stats

RUN rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-gnu  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

## Install a musl cross compiler for ${CROSS_COMPILER_TARGET_ARCH} using musl-cross-make
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    mkdir /tmp/musl-cross && mkdir /tmp/musl-cross-out && cd /tmp/musl-cross && \
    curl --retry 3 -sSfL "https://github.com/richfelker/musl-cross-make/archive/v0.9.9.tar.gz" -O &&\
    tar --strip-components=1 -xzf "v0.9.9.tar.gz" && \
    echo "GCC_CONFIG += --enable-default-pie" >> config.mak && \
    echo 'COMMON_CONFIG="CC=$(CC_WRAPPER) $(CC)"' >> config.mak && \
    echo 'COMMON_CONFIG += "CXX=$(CC_WRAPPER) $(CXX)"' >> config.mak && \
    echo 'COMMON_CONFIG += "STAGE_CC_WRAPPER=$(CC_WRAPPER)"' >> config.mak && \
    make install "-j$(nproc)" \
        CC_WRAPPER=$CC_WRAPPER \
        DL_CMD='curl --retry 3 -sSfL -C - -o' \
        LINUX_HEADERS_SITE=https://ci-mirrors.rust-lang.org/rustc/sabotage-linux-tarballs \
        OUTPUT=/tmp/musl-cross-out/ \
        TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-musl && \
    sccache --show-stats && \
    rm -rf /tmp/musl-cross

## Set up default cargo env vars for cross compiling
ENV CC_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_musl=${CROSS_COMPILER_TARGET_ARCH}-linux-musl-gcc \
    CXX_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_musl=${CROSS_COMPILER_TARGET_ARCH}-linux-musl-g++ \
    CC_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_gnu=gcc \
    CXX_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_gnu=g++ \
    CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=aarch64-linux-musl-gcc \
    CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc

## Install static Zlib
ARG ZLIB_VERSION=1.2.11
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    echo "Building zlib" && \
    mkdir -p /tmp/zlib && cd /tmp/zlib && \
    curl -fLO "http://zlib.net/zlib-$ZLIB_VERSION.tar.gz" && \
    tar xzf "zlib-$ZLIB_VERSION.tar.gz" && cd "zlib-$ZLIB_VERSION" && \
    CC="$CC_WRAPPER /tmp/musl-cross-out/bin/${CROSS_COMPILER_TARGET_ARCH}-linux-musl-gcc" ./configure --static --prefix=/usr/local/musl && \
    make -j$(nproc) && make install && \
    sccache --show-stats && \
    rm -r /tmp/zlib

ENV PKG_CONFIG_ALLOW_CROSS=true \
    PKG_CONFIG_ALL_STATIC=true \
    LIBZ_SYS_STATIC=1 \
    PLATFORM_LDFLAGS="-static-libstdc++ -static-libgcc"

## Install static -fPIC Rocksdb
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    echo "Building rocksdb" && \
    cd /tmp && \
    git clone https://github.com/facebook/rocksdb.git && \
    cd rocksdb && \
    git checkout v6.22.1 && \
    PORTABLE=1 CCFLAGS=-fPIC CXXFLAGS=-fPIC \
    CC="$CC_WRAPPER /tmp/musl-cross-out/bin/${CROSS_COMPILER_TARGET_ARCH}-linux-musl-gcc" CXX="$CC_WRAPPER /tmp/musl-cross-out/bin/${CROSS_COMPILER_TARGET_ARCH}-linux-musl-g++" \
    make -j$(nproc) static_lib && \
    mkdir -p /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib && \
    mkdir /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/include && \
    cp librocksdb.a* /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib && \
    cp -r include /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/ && \
    cp -r include/* /usr/include/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/ && \
    sccache --show-stats && \
    rm -R /tmp/rocksdb/

# Base image
FROM --platform=${TARGETPLATFORM} ${BASE_IMAGE}

ARG CROSS_COMPILER_TARGET_ARCH

RUN rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-gnu  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

RUN mkdir -p /usr/local/
COPY --from=build /tmp/musl-cross-out/* /usr/local/musl-cross-${CROSS_COMPILER_TARGET_ARCH}-linux-musl
COPY --from=build /tmp/tools/bin/* /usr/local/bin/
COPY --from=build /usr/local/rocksdb /usr/local/
COPY --from=build /usr/local/musl /usr/local/

CMD ["bash"]
