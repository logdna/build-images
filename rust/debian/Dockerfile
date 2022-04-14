ARG CROSS_COMPILER_TARGET_ARCH=x86_64
ARG BASE_IMAGE=logdna/build-images/rust-buster-1-stable-base-${CROSS_COMPILER_TARGET_ARCH}

# Image that runs natively on the BUILDPLATFORM to produce cross compile
# artifacts
FROM --platform=${BUILDPLATFORM} ${BASE_IMAGE} as build

SHELL ["/bin/bash", "-c"]

ARG BUILDARCH
ARG TARGETARCH

ARG CROSS_COMPILER_TARGET_ARCH
ARG SCCACHE_BUCKET
ARG SCCACHE_REGION
ARG SCCACHE_ENDPOINT
ARG SCCACHE_RECACHE
ARG SCCACHE_SERVER_PORT=4226

RUN rustup target add "${!TARGETARCH}-unknown-linux-musl"  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

RUN dpkg --add-architecture ${TARGETARCH} && \
    dpkg --add-architecture ${!CROSS_COMPILER_TARGET_ARCH} && \
    apt-get update -y && apt-get install --no-install-recommends -y musl-dev:${TARGETARCH}

ENV CC_aarch64_unknown_linux_musl=clang
ENV CFLAGS_aarch64_unknown_linux_musl="-isystem /usr/include/aarch64-linux-musl"
ENV CC_x86_64_unknown_linux_musl=clang
ENV CFLAGS_x86_64_unknown_linux_musl="-isystem /usr/include/x86_64-linux-musl"

# Add cargo-flamegraph and cargo-cache
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset RUSTC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    mkdir -p /out/tools && \
    cargo install --git https://github.com/flamegraph-rs/flamegraph \
        --tag v0.5.1 --locked --root /out/tools \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    cargo install cargo-cache --version 0.8.2  --locked --root /out/tools \
        --no-default-features --features ci-autoclean,vendored-libgit \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    cargo install cargo-audit --version 0.16.0  --locked --root /out/tools \
        --no-default-features --features vendored-openssl,vendored-libgit2 \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    sccache --show-stats

ENV LINUX_HEADER_VERSION="4.19.88"
ARG MUSL_VERSION="1.2.2"

ENV LLVM_SYSROOT="/sysroot/${CROSS_COMPILER_TARGET_ARCH}-musl"
ENV MUSL_TRIPLE="${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl"

# Create LLVM_SYSROOT
RUN mkdir -p $LLVM_SYSROOT

# Install linux headers in LLVM_SYSROOT
RUN cd /tmp && \
    curl --retry 5 -sSfL -O "https://github.com/sabotage-linux/kernel-headers/archive/v$LINUX_HEADER_VERSION.tar.gz" && \
    tar xf v$LINUX_HEADER_VERSION.tar.gz && cd kernel-headers-$LINUX_HEADER_VERSION && \
    make ARCH=${CROSS_COMPILER_TARGET_ARCH} prefix=$LLVM_SYSROOT/usr/ install && \
    cd / && rm -r /tmp/*

# Download and untar musl
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    curl -fSLo /tmp/musl.tar.gz https://www.musl-libc.org/releases/musl-$MUSL_VERSION.tar.gz && \
    tar -C /tmp -xf /tmp/musl.tar.gz && \
    cd /tmp/musl-$MUSL_VERSION && \
    AR=llvm-ar RANLIB=llvm-ranlib CC="$CC_WRAPPER clang" \
    CFLAGS="--target=$MUSL_TRIPLE" \
    LDFLAGS="-fuse-ld=lld -L$LLVM_SYSROOT/usr/lib/linux/" \
    LIBCC="-lclang_rt.builtins-${CROSS_COMPILER_TARGET_ARCH}" \
    ./configure --prefix=$LLVM_SYSROOT/usr/$MUSL_TRIPLE \
                --syslibdir=$LLVM_SYSROOT/usr/lib \
                --build=${!BUILDARCH} \
                --target=$MUSL_TRIPLE && \
    make install-headers

#############################################################################
## The Cross Compile image
#############################################################################
FROM --platform=${TARGETPLATFORM} ${BASE_IMAGE}

# Copy in the cross compiled cargo tools from base
COPY --from=build /out/tools/* /usr/local/bin/
COPY --from=build /sysroot /sysroot

ARG BUILDARCH
ARG TARGETARCH

ARG CROSS_COMPILER_TARGET_ARCH
ARG SCCACHE_BUCKET
ARG SCCACHE_REGION
ARG SCCACHE_ENDPOINT
ARG SCCACHE_RECACHE
ARG SCCACHE_SERVER_PORT=4226

ARG CROSS_COMPILER_TARGET_ARCH

RUN rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl && \
    rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-gnu  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

## Install a musl cross compiler for ${CROSS_COMPILER_TARGET_ARCH} using musl-cross-make
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    mkdir /tmp/musl-cross && cd /tmp/musl-cross && \
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
        OUTPUT=/usr/local/ \
        TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-musl && \
    sccache --show-stats && \
    rm -rf /tmp/musl-cross

## Install static Zlib
ARG ZLIB_VERSION=1.2.12
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    echo "Building zlib" && \
    cd /tmp && \
    curl -fLO "http://zlib.net/zlib-$ZLIB_VERSION.tar.gz" && \
    tar xzf "zlib-$ZLIB_VERSION.tar.gz" && cd "zlib-$ZLIB_VERSION" && \
    CC="$CC_WRAPPER ${CROSS_COMPILER_TARGET_ARCH}-linux-musl-gcc" ./configure --static --prefix=/usr/local/musl && \
    make -j$(nproc) && make install && \
    sccache --show-stats && \
    rm -r /tmp/*

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
    CC="$CC_WRAPPER ${CROSS_COMPILER_TARGET_ARCH}-linux-musl-gcc" CXX="$CC_WRAPPER ${CROSS_COMPILER_TARGET_ARCH}-linux-musl-g++" \
    make -j$(nproc) static_lib && \
    mkdir -p /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib && \
    mkdir /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/include && \
    cp librocksdb.a* /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib && \
    cp -r include /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/ && \
    cp -r include/* /usr/include/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/ && \
    sccache --show-stats && \
    rm -R /tmp/rocksdb/

ENV CC_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_musl=${CROSS_COMPILER_TARGET_ARCH}-linux-musl-gcc \
    CXX_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_musl=${CROSS_COMPILER_TARGET_ARCH}-linux-musl-g++ \
    CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=aarch64-linux-musl-gcc \
    CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc

ENV PCRE2_SYS_STATIC=1

CMD ["bash"]
