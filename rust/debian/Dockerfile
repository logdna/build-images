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

ENV LLVM_SYSROOT=/sysroot/debian-${VARIANT_VERSION}-${CROSS_COMPILER_TARGET_ARCH}

# Set up llvm sysroot
RUN dpkg --add-architecture ${TARGETARCH} && \
    dpkg --add-architecture ${!CROSS_COMPILER_TARGET_ARCH} && \
    apt-get update -y && apt-get install --no-install-recommends -y musl-dev:${TARGETARCH} && \
    mkdir -p $LLVM_SYSROOT && cd /tmp && \
    curl --retry 5 -sSfL -O "https://github.com/sabotage-linux/kernel-headers/archive/v$LINUX_HEADER_VERSION.tar.gz" && \
    tar xf v$LINUX_HEADER_VERSION.tar.gz && cd kernel-headers-$LINUX_HEADER_VERSION && \
    make ARCH=${CROSS_COMPILER_TARGET_ARCH} prefix=$LLVM_SYSROOT/usr/ install && \
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
    cargo install cargo-audit --version 0.16.0  --locked --root /out/tools \
    --no-default-features --features vendored-openssl,vendored-libgit2 \
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
    TARGET=${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl; \
    AR=llvm-ar RANLIB=llvm-ranlib CC="$CC_WRAPPER clang" \
    CFLAGS="--target=$TARGET" \
    LDFLAGS="-fuse-ld=lld -L$LLVM_SYSROOT/usr/lib/linux/" \
    LIBCC="-lclang_rt.builtins-${CROSS_COMPILER_TARGET_ARCH}" \
    ./configure --prefix=$LLVM_SYSROOT/usr/$TARGET \
                --syslibdir=$LLVM_SYSROOT/usr/lib \
                --build=${!BUILDARCH} \
                --target=$TARGET && \
    make install-headers

RUN set -x \
    && cd /tmp \
    && curl -fSLO https://github.com/llvm/llvm-project/releases/download/llvmorg-${LLVM_VERSION}/llvm-project-${LLVM_VERSION}.src.tar.xz \
    && mkdir -p /tmp/llvm-project/ \
    && tar -C /tmp/llvm-project/ --strip-components=1 -xf llvm-project-${LLVM_VERSION}.src.tar.xz

ENV CMAKE_COMMAND="cmake --parallel=$(nproc)"
ENV CMAKE_HOST_ARGS="-DCMAKE_INSTALL_PREFIX=${LLVM_SYSROOT}/usr -DCMAKE_EXE_LINKER_FLAGS=-fuse-ld=lld"
ENV CMAKE_HOST="$CMAKE_COMMAND $CMAKE_HOST_ARGS"
ENV CMAKE_TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-musl
ENV CMAKE_PROGRAMS="-DCMAKE_AR=/usr/bin/llvm-ar -DCMAKE_C_COMPILER=/usr/bin/clang -DCMAKE_CXX_COMPILER=/usr/bin/clang++ -DCMAKE_NM=/usr/bin/llvm-nm -DCMAKE_RANLIB=/usr/bin/llvm-ranlib -DLLVM_CONFIG_PATH=/usr/bin/llvm-config"
ENV CMAKE_CROSS_ARGS="${CMAKE_PROGRAMS} ${CMAKE_HOST_ARGS} -DCMAKE_INSTALL_PREFIX=${LLVM_SYSROOT}/usr ${CMAKE_HOST_ARGS} -DCMAKE_CROSSCOMPILING=1 -DCMAKE_ASM_COMPILER_TARGET=${CMAKE_TARGET} -DCMAKE_C_COMPILER_TARGET=${CMAKE_TARGET} -DCMAKE_CXX_COMPILER_TARGET=${CMAKE_TARGET} -DLLVM_DEFAULT_TARGET_TRIPLE=${CMAKE_TARGET} -DCMAKE_C_COMPILER_WORKS=TRUE -DCMAKE_CXX_COMPILER_WORKS=TRUE"
ENV CMAKE_SHARED_FLAGS="--gcc-toolchain=${LLVM_SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl -fuse-ld=lld -nostdinc -nodefaultlibs -nostdlib -isystem ${LLVM_SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ -isystem ${LLVM_SYSROOT}/usr/include/"
ENV CMAKE_C_FLAGS="${CMAKE_SHARED_FLAGS} -B${LLVM_SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib/"
ENV CMAKE_CXX_FLAGS="-nostdinc++ ${CMAKE_SHARED_FLAGS} --stdlib=libc++ --rtlib=compiler-rt"
ENV CMAKE_CROSS="$CMAKE_COMMAND $CMAKE_CROSS_ARGS"

RUN cmake --version

# Install sysroot clang headers
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    if [ -z "$CC_WRAPPER" ]; then export CMAKE_LAUNCHERS="-DCMAKE_C_COMPILER_LAUNCHER=$CC_WRAPPER -DCMAKE_CXX_COMPILER_LAUNCHER=$CC_WRAPPER"; fi; \
    export REPOS=/tmp/llvm-project && \
    cd $REPOS/llvm && mkdir build && cd build && \
    $CMAKE_HOST -DLLVM_ENABLE_DOXYGEN=OFF .. && \
    cd $REPOS/clang && mkdir build && cd build && \
    $CMAKE_HOST $CMAKE_LAUNCHERS -DCMAKE_MODULE_PATH="$REPOS/llvm/build/cmake/modules/CMakeFiles;$REPOS/llvm/build/lib/cmake/llvm/" -DLLVM_ENABLE_LIBCXX:BOOL=ON -DLLVM_DIR="$REPOS/llvm" .. && \
    make -j $(nproc) install-clang-resource-headers && \
    # Generate and install sysroot libc++ headers \
    cd $REPOS/clang && cd build && \
    cd $REPOS/libcxx && mkdir build && cd build && \
    $CMAKE_CROSS $CMAKE_LAUNCHERS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DCMAKE_C_IMPLICIT_LINK_DIRECTORIES= -DCMAKE_CXX_IMPLICIT_LINK_DIRECTORIES= -DLIBCXX_LINK_FLAGS=-fuse-ld=lld -DLIBCXX_GCC_TOOLCHAIN=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl -DLIBCXX_HAS_MUSL_LIBC=1 -DLIBCXX_HAS_GCC_S_LIB=0 -DLIBCXX_CXX_ABI=libcxxabi -DLIBCXX_CXX_ABI_INCLUDE_PATHS="$REPOS/libcxxabi/include" -DLIBCXX_CXX_ABI_LIBRARY_PATH="$REPOS/libcxxabi/build/lib" -DLLVM_PATH="$REPOS/llvm" .. && \
    make -j $(nproc) cxx_abi_headers generate-cxx-headers install-cxx-headers && \
    # Build and install sysroot compiler-rt \
    cd $REPOS/compiler-rt && mkdir build && cd build && \
    $CMAKE_CROSS $CMAKE_LAUNCHERS -DCMAKE_C_FLAGS="${CMAKE_C_FLAGS}" -DCMAKE_CXX_FLAGS="${CMAKE_CXX_FLAGS}" -DCMAKE_C_IMPLICIT_LINK_DIRECTORIES= -DCMAKE_CXX_IMPLICIT_LINK_DIRECTORIES= -DCOMPILER_RT_BUILD_BUILTINS=ON -DCOMPILER_RT_BUILD_LIBFUZZER=OFF -DCOMPILER_RT_BUILD_MEMPROF=OFF -DCOMPILER_RT_BUILD_PROFILE=OFF -DCOMPILER_RT_BUILD_SANITIZERS=OFF -DCOMPILER_RT_BUILD_XRAY=OFF -DCOMPILER_RT_DEFAULT_TARGET_ONLY=ON -DLLVM_PATH="$REPOS/llvm" .. && \
    make -j $(nproc) install-builtins

# Finish musl libc build and install
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    cd /tmp/musl-$MUSL_VERSION && \
    make -j $(nproc) && make install

# Finish libc++ build and install
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    if [ -z "$CC_WRAPPER" ]; then export CMAKE_LAUNCHERS="-DCMAKE_C_COMPILER_LAUNCHER=$CC_WRAPPER -DCMAKE_CXX_COMPILER_LAUNCHER=$CC_WRAPPER"; fi; \
    export REPOS=/tmp/llvm-project && \
    TARGET=${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl; \
    cd $REPOS/libunwind && mkdir build && cd build && \
    $CMAKE_CROSS $CMAKE_LAUNCHERS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DLIBUNWIND_LINK_FLAGS=-fuse-ld=lld -DCMAKE_LLVM_SYSROOT=${LLVM_SYSROOT} -DLIBUNWIND_GCC_TOOLCHAIN=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl -DLIBUNWIND_ENABLE_SHARED=0 -DLLVM_PATH="$REPOS/llvm" .. && \
    make -j $(nproc) && \
    cd $REPOS/libcxxabi/ && mkdir build && cd build && \
    $CMAKE_CROSS $CMAKE_LAUNCHERS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DLIBCXXABI_HAS_CXA_THREAD_ATEXIT_IMPL=NO -DLIBCXXABI_LINK_FLAGS=-fuse-ld=lld -DLIBCXXABI_GCC_TOOLCHAIN=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl -DCMAKE_SHARED_LINKER_FLAGS="-L$REPOS/libunwind/build/lib" -DLIBCXXABI_USE_LLVM_UNWINDER=1 -DLIBCXXABI_LIBUNWIND_PATH="$REPOS/libunwind" -DLIBCXXABI_LIBCXX_INCLUDES="$REPOS/libcxx/build/include/c++/v1/" -DLLVM_PATH="$REPOS/llvm" .. && \
    make -j $(nproc) cxxabi_static && \
    make install && \
    cd $REPOS/libcxx/build && \
    make -j $(nproc) && \
    make install

## Install static Zlib
ARG ZLIB_VERSION=1.2.12

RUN mkdir -p /tmp/zlib && cd /tmp/zlib && \
    curl -fLO "http://zlib.net/zlib-$ZLIB_VERSION.tar.gz" && \
    tar xzf "zlib-$ZLIB_VERSION.tar.gz" && cd "zlib-$ZLIB_VERSION"

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    echo "Building zlib" && \
    cd /tmp/zlib/zlib-$ZLIB_VERSION && \
    CC="$CC_WRAPPER clang --target=${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl" \
    CFLAGS="-nostdinc -isystem $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/" \
    LDSHARED="lld" AR=llvm-ar RANLIB=llvm-ranlib \
    LDFLAGS="-L$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib" \
    ./configure --static --shared --prefix=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl || cat configure.log && \
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
    export C_INCLUDES="-isystem $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ -isystem $LLVM_SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $LLVM_SYSROOT/usr/include/"; \
    export CC="$CC_WRAPPER clang --target=${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl"; \
    export EXTRA_CFLAGS="-nostdinc -fPIC $C_INCLUDES -nostdlib -nostdlib++ -nodefaultlibs -Wno-unused-command-line-argument"; \
    export CXX="$CC_WRAPPER clang++ -nostdlib++ -fuse-ld=lld --target=${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl"; \
    export EXTRA_CXXFLAGS="-nostdinc -nostdinc++ -fPIC -isystem $LLVM_SYSROOT/usr/include/c++/v1/ -isystem $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ -D _LIBCPP_HAS_MUSL_LIBC $C_INCLUDES -Wno-unused-command-line-argument "; \
    export CFLAGS="$EXTRA_CFLAGS -L$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib"; \
    DISABLE_WARNING_AS_ERROR=1 make -j$(nproc) static_lib && \
    cp librocksdb.a* $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib && \
    cp -r include/* $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ && \
    sccache --show-stats && \
    rm -R /tmp/rocksdb/

RUN llvm-ar cru $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib/libstdc++.a

CMD ["bash"]

# Base image
FROM --platform=${TARGETPLATFORM} ${BASE_IMAGE}

ARG CROSS_COMPILER_TARGET_ARCH

ENV LLVM_SYSROOT=/sysroot/debian-${VARIANT_VERSION}-${CROSS_COMPILER_TARGET_ARCH}
RUN env

RUN rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-gnu  && \
    rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl  && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

COPY --from=build /out/tools/* /usr/local/bin/
COPY --from=build /sysroot /sysroot

# Legacy paths for agent <= 3.4
RUN ln -s ${LLVM_SYSROOT}/usr/rocksdb /usr/local/rocksdb
RUN ln -s ${LLVM_SYSROOT}/usr/lib/ /usr/local/lib

ENV PCRE2_SYS_STATIC=1
ENV SYSTEMD_LIB_DIR="/lib/${CROSS_COMPILER_TARGET_ARCH}-linux-gnu"

ENV COMMON_RUSTFLAGS="-Clinker=clang -Clink-args=-fuse-ld=lld"
ENV SHARED_RUSTFLAGS="${COMMON_RUSTFLAGS}"
ENV STATIC_RUSTFLAGS="${COMMON_RUSTFLAGS} -Ctarget-feature=+crt-static -Clink-args=-static -Clink-args=-nodefaultlibs -Clink-args=-nostdlib -Clink-args=-nostdlib++ -Clink-args=-stdlib=c++ -L /usr/local/$(ARCH)-linux-musl/lib/ -Clink-args=-static-libgcc -l static=c++ -Clink-args=-static-libstdc++"

ENV MUSL_C_INCLUDES="-isystem $LLVM_SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ -isystem $LLVM_SYSROOT/usr/include/linux/"
ENV MUSL_CXX_INCLUDES="-isystem $LLVM_SYSROOT/usr/include/c++/v1/ -isystem $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ "

ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="${STATIC_RUSTFLAGS} -Clink-args=--target=aarch64-unknown-linux-musl -Lnative=${LLVM_SYSROOT}/usr/lib/"
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER="clang"
ENV LDFLAGS_aarch64_unknown_linux_musl="--target=aarch64-unknown-linux-musl -fuse-ld=lld -nodefaultlibs -nostdlib -L ${LLVM_SYSROOT}/usr/aarch64-unknown-linux-musl/lib -lc -L ${LLVM_SYSROOT}/usr/lib/linux/ -lclang_rt.builtins-aarch64"
ENV CC_aarch64_unknown_linux_musl="clang"
ENV CFLAGS_aarch64_unknown_linux_musl="--target=aarch64-unknown-linux-musl -fuse-ld=lld -static -fPIC  -nostdlib -nodefaultlibs -nostdinc ${MUSL_C_INCLUDES} -L ${LLVM_SYSROOT}/usr/aarch64-unknown-linux-musl/lib -lc  -L ${LLVM_SYSROOT}/usr/lib/linux/ -lclang_rt.builtins-aarch64"
ENV CXX_aarch64_unknown_linux_musl="clang++"
ENV CXXFLAGS_aarch64_unknown_linux_musl="--target=aarch64-unknown-linux-musl -fuse-ld=lld -nostdinc -static-libstdc++ --stdlib=c++ --rtlib=compiler-rt -nodefaultlibs -nostdinc++ ${MUSL_CXX_INCLUDES} ${MUSL_C_INCLUDES}"

ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="${STATIC_RUSTFLAGS} -Clink-args=--target=x86_64-unknown-linux-musl  -Lnative=${LLVM_SYSROOT}/usr/lib/"
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER="clang"
ENV LDFLAGS_x86_64_unknown_linux_musl="--target=x86_64-unknown-linux-musl -fuse-ld=lld -nodefaultlibs -nostdlib -L ${LLVM_SYSROOT}/usr/x86_64-unknown-linux-musl/lib -lc -L ${LLVM_SYSROOT}/usr/lib/linux/ -lclang_rt.builtins-x86_64"
ENV CC_x86_64_unknown_linux_musl="clang"
ENV CFLAGS_x86_64_unknown_linux_musl="--target=x86_64-unknown-linux-musl -fuse-ld=lld -static -fPIC  -nostdlib -nodefaultlibs -nostdinc ${MUSL_C_INCLUDES} -L ${LLVM_SYSROOT}/usr/x86_64-unknown-linux-musl/lib -lc -L ${LLVM_SYSROOT}/usr/lib/linux/ -lclang_rt.builtins-x86_64"
ENV CXX_x86_64_unknown_linux_musl="clang++"
ENV CXXFLAGS_x86_64_unknown_linux_musl="--target=x86_64-unknown-linux-musl -fuse-ld=lld -nostdinc -static-libstdc++ --stdlib=c++ --rtlib=compiler-rt -nodefaultlibs -nostdinc++ ${MUSL_CXX_INCLUDES} ${MUSL_C_INCLUDES}"

ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_RUSTFLAGS="${CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_RUSTFLAGS} ${SHARED_RUSTFLAGS} -Clink-args=--target=aarch64-unknown-linux-gnu"
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER="clang"
ENV LDLAGS_aarch64_unknown_linux_gnu="--target=aarch64-unknown-linux-gnu -fuse-ld=lld"
ENV CC_aarch64_unknown_linux_gnu="clang"
ENV CFLAGS_aarch64_unknown_linux_gnu="--target=aarch64-unknown-linux-gnu -fuse-ld=lld"
ENV CXX_aarch64_unknown_linux_gnu="clang++"
ENV CXXFLAGS_aarch64_unknown_linux_gnu="--target=aarch64-unknown-linux-gnu -fuse-ld=lld"

ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUSTFLAGS="${CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUSTFLAGS} ${SHARED_RUSTFLAGS} -Clink-args=--target=x86_64-unknown-linux-gnu"
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER="clang"
ENV LDLAGS_x86_64_unknown_linux_gnu="--target=x86_64-unknown-linux-gnu -fuse-ld=lld"
ENV CC_x86_64_unknown_linux_gnu="clang"
ENV CFLAGS_x86_64_unknown_linux_gnu="--target=x86_64-unknown-linux-gnu -fuse-ld=lld"
ENV CXX_x86_64_unknown_linux_gnu="clang++"
ENV CXXFLAGS_x86_64_unknown_linux_gnu="--target=x86_64-unknown-linux-gnu -fuse-ld=lld"

CMD ["bash"]
