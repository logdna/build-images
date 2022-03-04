ARG BASE_IMAGE
ARG CROSS_COMPILER_TARGET_ARCH

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

RUN test -z "${CROSS_COMPILER_TARGET_ARCH}" || exit 0 && exit 1
RUN rustup target add "${!TARGETARCH}-unknown-linux-musl"  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

ENV LINUX_HEADER_VERSION=4.19.88
ARG MUSL_VERSION=1.2.2

ENV SYSROOT=/sysroot/debian-${VARIANT_VERSION}-${CROSS_COMPILER_TARGET_ARCH}
ENV SYSROOT_LLVM=$SYSROOT/usr/lib/llvm-${LLVM_VERSION}
ENV SYSROOT_CLANG=$SYSROOT/usr/lib/clang/${LLVM_VERSION}

# Set up llvm sysroot
RUN dpkg --add-architecture ${TARGETARCH} && \
    dpkg --add-architecture ${!CROSS_COMPILER_TARGET_ARCH} && \
    apt-get update -y && apt-get install -y musl-dev:${TARGETARCH} && \
    mkdir -p $SYSROOT && cd /tmp && \
    deps="libclang-common-${LLVM_VERSION}-dev libc++-${LLVM_VERSION}-dev"; \
    apt update -y && \
    for dep in $deps; do \
        apt download "$dep:${!CROSS_COMPILER_TARGET_ARCH}" && \
        dpkg -i --force-depends --instdir $SYSROOT $dep*.deb; \
    done && \
    curl --retry 5 -sSfL -O "https://github.com/sabotage-linux/kernel-headers/archive/v$LINUX_HEADER_VERSION.tar.gz" && \
    tar xf v$LINUX_HEADER_VERSION.tar.gz && cd kernel-headers-$LINUX_HEADER_VERSION && \
    make ARCH=${CROSS_COMPILER_TARGET_ARCH} prefix=$SYSROOT/usr/ install && \
    cd / && apt clean -y && rm -r /tmp/*

## Set up default cargo env vars for cross compiling
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=clang
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_AR=llvm-ar
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="-C link-args=-fuse-ld=lld -C link-args=--target=aarch64-unknown-linux-musl"
ENV CC_aarch64_unknown_linux_musl=clang
ENV CFLAGS_aarch64_unknown_linux_musl="-isystem /usr/include/aarch64-linux-musl"

ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=clang
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_AR=llvm-ar
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_RUSTFLAGS="-C link-args=-fuse-ld=lld -C link-args=--target=aarch64-unknown-linux-gnu"

ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=clang
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_AR=llvm-ar
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="-Clink-args=-fuse-ld=lld -Clink-args=--target=x86_64-unknown-linux-musl"
ENV CC_x86_64_unknown_linux_musl=clang
ENV CFLAGS_x86_64_unknown_linux_musl="-isystem /usr/include/x86_64-linux-musl"

ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=clang
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_AR=llvm-ar
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUSTFLAGS="-C link-args=-fuse-ld=lld -C link-args=--target=x86_64-unknown-linux-gnu"

# Add cargo-flamegraph and cargo-cache
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset RUSTC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    mkdir -p /out/tools && \
    cargo install --git https://github.com/flamegraph-rs/flamegraph --tag v0.5.1 --locked --root /out/tools \
    --target=${!TARGETARCH}-unknown-linux-musl && \
    cargo install cargo-cache --version 0.8.2  --locked --root /out/tools \
    --no-default-features --features ci-autoclean,vendored-libgit \
    --target=${!TARGETARCH}-unknown-linux-musl && \
    sccache --show-stats

RUN rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-gnu  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

RUN curl -fSLo /tmp/musl.tar.gz https://www.musl-libc.org/releases/musl-$MUSL_VERSION.tar.gz && \
    tar -C /tmp -xf /tmp/musl.tar.gz

# Compile and install musl
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    cd /tmp/musl-$MUSL_VERSION && \
    TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl; \
    AR=llvm-ar RANLIB=llvm-ranlib CC="$CC_WRAPPER clang" \
    CFLAGS="--target=$TARGET" \
    LDFLAGS="-fuse-ld=lld -L$SYSROOT_CLANG/lib/linux/" \
    LIBCC="-lclang_rt.builtins-${CROSS_COMPILER_TARGET_ARCH}" \
    ./configure --prefix=$SYSROOT/usr/$TARGET \
                --syslibdir=$SYSROOT/usr/lib \
                --build=${!BUILDARCH} \
                --target=$TARGET && \
    make -j $(nproc) && make install

## Install static Zlib
ARG ZLIB_VERSION=1.2.11

RUN mkdir -p /tmp/zlib && cd /tmp/zlib && \
    curl -fLO "http://zlib.net/zlib-$ZLIB_VERSION.tar.gz" && \
    tar xzf "zlib-$ZLIB_VERSION.tar.gz" && cd "zlib-$ZLIB_VERSION"

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    echo "Building zlib" && \
    cd /tmp/zlib/zlib-$ZLIB_VERSION && \
    CC="$CC_WRAPPER clang --target=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl" \
    CFLAGS="-nostdinc -isystem $SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/include/" \
    LDSHARED="lld" AR=llvm-ar RANLIB=llvm-ranlib \
    LDFLAGS="-L$SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/lib" \
    ./configure --static --shared --prefix=$SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-musl || cat configure.log && \
    make -j$(nproc) install && \
    sccache --show-stats && \
    rm -r /tmp/zlib

## Install static -fPIC Rocksdb
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    echo "Building rocksdb" && \
    git clone https://github.com/facebook/rocksdb.git --branch v6.22.1 --depth=1 /tmp/rocksdb; \
    cd /tmp/rocksdb && \
    export USE_CLANG=1 TARGET_OS=Linux PORTABLE=1 AR=llvm-ar; \
    export TARGET_ARCHITECTURE=${CROSS_COMPILER_TARGET_ARCH}; \
    export C_INCLUDES="-isystem $SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/include/ -isystem $SYSROOT_CLANG/include/ -isystem $SYSROOT/usr/include/"; \
    export CC="$CC_WRAPPER clang --target=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl"; \
    export EXTRA_CFLAGS="-nostdinc -fPIC $C_INCLUDES -nostdlib -nostdlib++ -nodefaultlibs -Wno-unused-command-line-argument"; \
    export CXX="$CC_WRAPPER clang++ -nostdlib++ -fuse-ld=lld --target=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl"; \
    export EXTRA_CXXFLAGS="-nostdinc -nostdinc++ -fPIC -isystem $SYSROOT_LLVM/include/c++/v1/ -isystem $SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/include/ -D _LIBCPP_HAS_MUSL_LIBC $C_INCLUDES -Wno-unused-command-line-argument "; \
    export CFLAGS="$EXTRA_CFLAGS -L$SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/lib"; \
    DISABLE_WARNING_AS_ERROR=1 make -j$(nproc) static_lib && \
    mkdir -p $SYSROOT/usr/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib && \
    mkdir $SYSROOT/usr/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/include && \
    cp librocksdb.a* $SYSROOT/usr/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib && \
    cp -r include $SYSROOT/usr/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/ && \
    cp -r include/* $SYSROOT/usr/include/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/ && \
    sccache --show-stats && \
    rm -R /tmp/rocksdb/

CMD ["bash"]

# Base image
FROM --platform=${TARGETPLATFORM} ${BASE_IMAGE}

ARG CROSS_COMPILER_TARGET_ARCH

RUN rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-gnu  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

COPY --from=build /sysroot /sysroot

CMD ["bash"]
