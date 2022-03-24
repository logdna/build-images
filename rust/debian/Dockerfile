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

# Set up llvm sysroot
RUN dpkg --add-architecture ${TARGETARCH} && \
    dpkg --add-architecture ${!CROSS_COMPILER_TARGET_ARCH} && \
    apt-get update -y && apt-get install -y musl-dev:${TARGETARCH} && \
    mkdir -p $SYSROOT && cd /tmp && \
    curl --retry 5 -sSfL -O "https://github.com/sabotage-linux/kernel-headers/archive/v$LINUX_HEADER_VERSION.tar.gz" && \
    tar xf v$LINUX_HEADER_VERSION.tar.gz && cd kernel-headers-$LINUX_HEADER_VERSION && \
    make ARCH=${CROSS_COMPILER_TARGET_ARCH} prefix=$SYSROOT/usr/ install && \
    cd / && apt clean -y && rm -r /tmp/*

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

# Download and untar musl
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
    LDFLAGS="-fuse-ld=lld -L$SYSROOT/usr/lib/linux/" \
    LIBCC="-lclang_rt.builtins-${CROSS_COMPILER_TARGET_ARCH}" \
    ./configure --prefix=$SYSROOT/usr/$TARGET \
                --syslibdir=$SYSROOT/usr/lib \
                --build=${!BUILDARCH} \
                --target=$TARGET && \
    make install-headers

RUN set -x \
    && cd /tmp \
    && curl -fSLO https://github.com/llvm/llvm-project/releases/download/llvmorg-${LLVM_VERSION}/llvm-project-${LLVM_VERSION}.src.tar.xz \
    && mkdir -p /tmp/llvm-project/ \
    && tar -C /tmp/llvm-project/ --strip-components=1 -xf llvm-project-${LLVM_VERSION}.src.tar.xz

ENV CMAKE_TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-musl
ENV CMAKE_ARGS="-DCMAKE_ASM_COMPILER_TARGET=${CMAKE_TARGET} -DCMAKE_C_COMPILER_TARGET=${CMAKE_TARGET} -DCMAKE_AR=/usr/bin/llvm-ar -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_INSTALL_PREFIX=${SYSROOT}/usr -DCMAKE_SYSTEM_NAME=Linux -DLLVM_DEFAULT_TARGET_TRIPLE=${CROSS_COMPILER_TARGET_ARCH}-linux-musl -DCMAKE_NM=/usr/bin/llvm-nm -DCMAKE_RANLIB=/usr/bin/llvm-ranlib -DLLVM_CONFIG_PATH=/usr/bin/llvm-config-${LLVM_MAJOR_VERSION}"
ENV CMAKE_SHARED_FLAGS="--target=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl -isystem ${SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/include/ -isystem ${SYSROOT}/usr/include/"
ENV CMAKE_C_FLAGS="--target=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl -fuse-ld=lld -nostdinc -nodefaultlibs -nostdlib ${CMAKE_SHARED_FLAGS} -L ${SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/lib -lc -B${SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/lib/"
ENV CMAKE_CXX_FLAGS="--target=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl -fuse-ld=lld -nostdinc -nostdinc++ -nodefaultlibs -nostdlib ${CMAKE_SHARED_FLAGS} --stdlib=libc++ --rtlib=compiler-rt -L ${SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/lib -lc"

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    export REPOS=/tmp/llvm-project && \
    TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl; \
    cd $REPOS/llvm && mkdir build && cd build && \
    cmake -DCMAKE_INSTALL_PREFIX=${SYSROOT}/usr -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_SYSTEM_NAME=Linux -DLLVM_ENABLE_DOXYGEN=OFF -DCMAKE_EXE_LINKER_FLAGS="-fuse-ld=lld" .. && \
    cd $REPOS/clang && mkdir build && cd build && \
    cmake -DCMAKE_VERBOSE_MAKEFILE:BOOL=ON -DCMAKE_INSTALL_PREFIX=${SYSROOT}/usr -DCMAKE_MODULE_PATH="$REPOS/llvm/build/cmake/modules/CMakeFiles;$REPOS/llvm/build/lib/cmake/llvm/" -DCMAKE_FIND_PACKAGE_PREFER_CONFIG=TRUE -DCMAKE_EXE_LINKER_FLAGS="-fuse-ld=lld" -DLLVM_ENABLE_LIBCXX:BOOL=ON -DCMAKE_INSTALL_PREFIX=${SYSROOT}/usr -DLLVM_PATH="$REPOS/llvm" -DLLVM_DIR="$REPOS/llvm" .. && \
    make -j $(nproc) install-clang-resource-headers

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    export REPOS=/tmp/llvm-project && \
    TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl; \
    cd $REPOS/clang && cd build && \
    cd $REPOS/libcxx && mkdir build && cd build && cmake --parallel=$(nproc) $CMAKE_ARGS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DLIBCXX_LINK_FLAGS=-fuse-ld=lld -DLIBCXX_GCC_TOOLCHAIN=$SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH} -DLIBCXX_HAS_MUSL_LIBC=1 -DLIBCXX_HAS_GCC_S_LIB=0 -DLIBCXX_CXX_ABI=libcxxabi -DLIBCXX_CXX_ABI_INCLUDE_PATHS="$REPOS/libcxxabi/include" -DLIBCXX_CXX_ABI_LIBRARY_PATH="$REPOS/libcxxabi/build/lib" -DLLVM_PATH="$REPOS/llvm" -DCMAKE_C_COMPILER_WORKS=TRUE -DCMAKE_CXX_COMPILER_WORKS=TRUE .. && \
    make -j $(nproc) cxx_abi_headers generate-cxx-headers install-cxx-headers

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    export REPOS=/tmp/llvm-project && \
    TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl; \
    cd $REPOS/compiler-rt && mkdir build && cd build && \
    cmake -DCMAKE_VERBOSE_MAKEFILE:BOOL=ON $CMAKE_ARGS -DCMAKE_INSTALL_PREFIX=${SYSROOT}/usr -DCMAKE_C_COMPILER=clang -DCMAKE_C_FLAGS="--verbose --gcc-toolchain=${SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl -fuse-ld=lld -nostdinc -nodefaultlibs -nostdlib ${CMAKE_SHARED_FLAGS}" -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_CXX_FLAGS="--verbose --gcc-toolchain=${SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl -fuse-ld=lld -nostdinc -nostdinc++ -nodefaultlibs -nostdlib ${CMAKE_SHARED_FLAGS} --rtlib=compiler-rt" -DCMAKE_C_COMPILER_WORKS=TRUE -DCMAKE_CXX_COMPILER_WORKS=TRUE -DCMAKE_SYSTEM_NAME=Linux -DCMAKE_C_COMPILER_TARGET="$TARGET" -DCMAKE_CXX_COMPILER_TARGET="$TARGET" -DCMAKE_ASM_COMPILER_TARGET="$TARGET" -DCMAKE_EXE_LINKER_FLAGS="-fuse-ld=lld" -DCOMPILER_RT_BUILD_BUILTINS=ON -DCOMPILER_RT_BUILD_LIBFUZZER=OFF -DCOMPILER_RT_BUILD_MEMPROF=OFF -DCOMPILER_RT_BUILD_PROFILE=OFF -DCOMPILER_RT_BUILD_SANITIZERS=OFF -DCOMPILER_RT_BUILD_XRAY=OFF -DCOMPILER_RT_DEFAULT_TARGET_ONLY=ON -DLLVM_PATH="$REPOS/llvm" .. && \
    make -j $(nproc) install-builtins

# Finish musl build
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    cd /tmp/musl-$MUSL_VERSION && \
    make -j $(nproc) && make install

## Set up default cargo env vars for cross compiling
ENV CC_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_musl=${CROSS_COMPILER_TARGET_ARCH}-linux-musl-gcc \
    CXX_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_musl=${CROSS_COMPILER_TARGET_ARCH}-linux-musl-g++ \
    CC_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_gnu=gcc \
    CXX_${CROSS_COMPILER_TARGET_ARCH}_unknown_linux_gnu=g++ \
    CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=aarch64-linux-musl-gcc \
    CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    export REPOS=/tmp/llvm-project && \
    TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl; \
    cd $REPOS/libunwind && mkdir build && cd build && cmake --parallel=$(nproc) $CMAKE_ARGS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DLIBUNWIND_LINK_FLAGS=-fuse-ld=lld -DCMAKE_SYSROOT=${SYSROOT} -DCMAKE_CROSSCOMPILING=1 -DLIBUNWIND_GCC_TOOLCHAIN=$SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH} -DLIBUNWIND_ENABLE_SHARED=0 -DLLVM_PATH="$REPOS/llvm" .. && \
    make -j $(nproc) && \
    cd $REPOS/libcxxabi/ && mkdir build && cd build && cmake --parallel=$(nproc) $CMAKE_ARGS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DLIBCXXABI_LINK_FLAGS=-fuse-ld=lld -DLIBCXXABI_GCC_TOOLCHAIN=$SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH} -DCMAKE_SHARED_LINKER_FLAGS="-L$REPOS/libunwind/build/lib" -DLIBCXXABI_USE_LLVM_UNWINDER=1 -DLIBCXXABI_LIBUNWIND_PATH="$REPOS/libunwind" -DLIBCXXABI_LIBCXX_INCLUDES="$REPOS/libcxx/build/include/c++/v1/" -DLLVM_PATH="$REPOS/llvm" .. && \
    make -j $(nproc) && \
    cd $REPOS/libcxx/build && \
    make -j $(nproc) && \
    make install

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
    export C_INCLUDES="-isystem $SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/include/ -isystem $SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $SYSROOT/usr/include/"; \
    export CC="$CC_WRAPPER clang --target=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl"; \
    export EXTRA_CFLAGS="-nostdinc -fPIC $C_INCLUDES -nostdlib -nostdlib++ -nodefaultlibs -Wno-unused-command-line-argument"; \
    export CXX="$CC_WRAPPER clang++ -nostdlib++ -fuse-ld=lld --target=${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl"; \
    export EXTRA_CXXFLAGS="-nostdinc -nostdinc++ -fPIC -isystem $SYSROOT/usr/include/c++/v1/ -isystem $SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-linux-unknown-musl/include/ -D _LIBCPP_HAS_MUSL_LIBC $C_INCLUDES -Wno-unused-command-line-argument "; \
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

ENV SYSROOT=/sysroot/debian-${VARIANT_VERSION}-${CROSS_COMPILER_TARGET_ARCH}
RUN env

RUN rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-gnu  && \
    rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

COPY --from=build /sysroot /sysroot

# Legacy paths for agent <= 3.4
RUN ln -s ${SYSROOT}/usr/rocksdb /usr/local/rocksdb
RUN ln -s ${SYSROOT}/usr/lib/ /usr/local/lib

ENV PCRE2_SYS_STATIC=1
ENV SHARED_RUSTFLAGS="-Clink-args=-nodefaultlibs -Clink-args=-nostdlib -Clink-args=-nostdlib++ -Clink-args=-stdlib=c++ -Clink-args=-Wl,-verbose -Clink-args=--verbose -Ctarget-feature=+crt-static -Clink-args=-static -L /usr/local/$(ARCH)-linux-musl/lib/ -Clink-args=-static-libgcc -l static=c++ -Clink-args=-static-libstdc++"

ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="${CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_RUSTFLAGS} ${SHARED_RUSTFLAGS} -Clink-args=target=aarch64-unknown-linux-musl"
ENV CC_aarch64_unknown_linux_musl="clang --target=aarch64-unknown-linux-musl"
ENV CFLAGS_aarch64_unknown_linux_musl="-isystem /usr/include/aarch64-linux-musl -nodefaultlibs "
ENV CXX_aarch64_unknown_linux_musl="clang++ --target=aarch64-unknown-linux-musl"
ENV CXXFLAGS_aarch64_unknown_linux_musl="--stdlib=libc++ --rtlib=compiler-rt -nodefaultlibs "

ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="${CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_RUSTFLAGS} ${SHARED_RUSTFLAGS} -Clink-args=target=x86_64-unknown-linux-musl -Lnative=${SYSROOT}/usr/x86_64-linux-unknown-musl/lib/"
ENV CC_x86_64_unknown_linux_musl="clang --target=x86_64-unknown-linux-musl"
ENV CFLAGS_x86_64_unknown_linux_musl="-nostdinc -isystem /usr/include/x86_64-linux-musl --rtlib=compiler-rt -nodefaultlibs "
ENV CXX_x86_64_unknown_linux_musl="clang++ --target=x86_64-unknown-linux-musl"
ENV CXXFLAGS_x86_64_unknown_linux_musl="-nostdinc --stdlib=libc++ --rtlib=compiler-rt -nodefaultlibs "

CMD ["bash"]
