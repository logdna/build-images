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

RUN rustup target add "${!TARGETARCH}-unknown-linux-musl"

RUN dpkg --add-architecture ${TARGETARCH} && \
    dpkg --add-architecture ${!CROSS_COMPILER_TARGET_ARCH} && \
    apt-get -q update -y && apt-get -q install --no-install-recommends -y musl-dev:${TARGETARCH} libcap-dev:${TARGETARCH}

ENV CC_aarch64_unknown_linux_musl=clang
ENV CFLAGS_aarch64_unknown_linux_musl="-isystem /usr/include/aarch64-linux-musl"
ENV CC_x86_64_unknown_linux_musl=clang
ENV CFLAGS_x86_64_unknown_linux_musl="-isystem /usr/include/x86_64-linux-musl"

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    mkdir -p /out/tools && \
    # Install sccache for this image \
    cargo install -q sccache --root "/usr/local" --no-default-features --features s3,azure,openssl/vendored && \
    echo "installed build build image sccache" && \
    if [ -n "$SCCACHE_BUCKET" ]; then export RUSTC_WRAPPER=/usr/local/bin/sccache; fi && \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi && \
    # Add sccache cargo-flamegraph, cargo-audit and cargo-cache \
    cargo install -q sccache --root /out/tools --no-default-features --features s3,azure,openssl/vendored \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    echo "built build image sccache" && \
    cargo install -q cargo-nextest --root /out/tools \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    echo "built build image cargo-nextest" && \
    cargo install -q cargo-llvm-cov --root /out/tools \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    echo "built build image cargo-xwin" && \
    cargo install -q cargo-xwin --version 0.9.2 --locked --root /out/tools \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    echo "built build image cargo-llvm-cov" && \
    cargo install -q --git https://github.com/flamegraph-rs/flamegraph \
        --tag v0.5.1 --locked --root /out/tools \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    echo "built build image cargo-flamegraph" && \
    cargo install -q cargo-cache --version 0.8.2 --locked --root /out/tools \
        --no-default-features --features ci-autoclean,vendored-libgit \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    echo "built build image cargo-cache" && \
    cargo install -q cargo-audit --version 0.16.0 --locked --root /out/tools \
        --no-default-features --features vendored-openssl,vendored-libgit2 \
        --target=${!TARGETARCH}-unknown-linux-musl && \
    echo "built build image cargo-audit" && \
    sccache --show-stats

ENV RUSTC_WRAPPER="/usr/local/bin/sccache"
ENV CC_WRAPPER="/usr/local/bin/sccache"

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
    MAKEFLAGS="--silent -j $(nproc)" && \
    make ARCH=${CROSS_COMPILER_TARGET_ARCH} prefix=$LLVM_SYSROOT/usr/ install && \
    cd / && rm -r /tmp/*

# Download and untar musl
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    curl -fSLo /tmp/musl.tar.gz https://www.musl-libc.org/releases/musl-$MUSL_VERSION.tar.gz && \
    tar -C /tmp -xf /tmp/musl.tar.gz && \
    cd /tmp/musl-$MUSL_VERSION && \
    MAKEFLAGS="--silent -j $(nproc)" && \
    AR=llvm-ar RANLIB=llvm-ranlib CC="$CC_WRAPPER clang" \
    CFLAGS="--target=$MUSL_TRIPLE" \
    LDFLAGS="-fuse-ld=lld -L$LLVM_SYSROOT/usr/lib/linux/" \
    LIBCC="-lclang_rt.builtins-${CROSS_COMPILER_TARGET_ARCH}" \
    ./configure --prefix=$LLVM_SYSROOT/usr/$MUSL_TRIPLE \
                --syslibdir=$LLVM_SYSROOT/usr/lib \
                --build=${!BUILDARCH} \
                --target=$MUSL_TRIPLE 2>&1 >/dev/null && \
    make install-headers

# Configure cmake for building llvm headers, compiler-rt and builtins
ENV CMAKE_COMMAND="cmake -q --parallel=$(nproc) --log-level=WARNING -DCMAKE_RULE_MESSAGES=OFF -DCMAKE_INSTALL_MESSAGE=NEVER"
ENV CMAKE_HOST_ARGS="-DCMAKE_INSTALL_PREFIX=${LLVM_SYSROOT}/usr -DCMAKE_EXE_LINKER_FLAGS=-fuse-ld=lld"
ENV CMAKE_HOST="$CMAKE_COMMAND $CMAKE_HOST_ARGS"
ENV CMAKE_TARGET=${CROSS_COMPILER_TARGET_ARCH}-linux-musl
ENV CMAKE_PROGRAMS="-DCMAKE_AR=/usr/bin/llvm-ar -DCMAKE_C_COMPILER=/usr/bin/clang \
                    -DCMAKE_CXX_COMPILER=/usr/bin/clang++ -DCMAKE_NM=/usr/bin/llvm-nm \
                    -DCMAKE_RANLIB=/usr/bin/llvm-ranlib -DLLVM_CONFIG_PATH=/usr/bin/llvm-config"
ENV CMAKE_CROSS_ARGS="${CMAKE_PROGRAMS} ${CMAKE_HOST_ARGS} \
                     -DCMAKE_INSTALL_PREFIX=${LLVM_SYSROOT}/usr ${CMAKE_HOST_ARGS} \
                     -DCMAKE_CROSSCOMPILING=1 -DCMAKE_ASM_COMPILER_TARGET=${CMAKE_TARGET} \
                     -DCMAKE_C_COMPILER_TARGET=${CMAKE_TARGET} -DCMAKE_CXX_COMPILER_TARGET=${CMAKE_TARGET} \
                     -DCMAKE_C_COMPILER_WORKS=TRUE -DCMAKE_CXX_COMPILER_WORKS=TRUE \
                     -DLLVM_DEFAULT_TARGET_TRIPLE=${CMAKE_TARGET}"
ENV CMAKE_SHARED_FLAGS="--gcc-toolchain=${LLVM_SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl \
                        -fuse-ld=lld -nostdinc -nodefaultlibs -nostdlib \
                        -isystem ${LLVM_SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ \
                        -isystem ${LLVM_SYSROOT}/usr/include/ -Wno-unused-command-line-argument"
ENV CMAKE_C_FLAGS="${CMAKE_SHARED_FLAGS} -B${LLVM_SYSROOT}/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib/"
ENV CMAKE_CXX_FLAGS="-nostdinc++ ${CMAKE_SHARED_FLAGS} --stdlib=libc++ --rtlib=compiler-rt"
ENV CMAKE_CROSS="$CMAKE_COMMAND $CMAKE_CROSS_ARGS"

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    if [ -z "$CC_WRAPPER" ]; then export CMAKE_LAUNCHERS="-DCMAKE_C_COMPILER_LAUNCHER=$CC_WRAPPER -DCMAKE_CXX_COMPILER_LAUNCHER=$CC_WRAPPER"; fi; \
    # Download and extract LLVM tarball for ${LLVM_VERSION} \
    export MAKEFLAGS="--silent -j $(nproc)" && \
    export REPOS=/tmp/llvm-project && \
    cd /tmp && mkdir -p $REPOS && \
    curl -fSLO https://github.com/llvm/llvm-project/releases/download/llvmorg-${LLVM_VERSION}/llvm-project-${LLVM_VERSION}.src.tar.xz && \
    tar -C $REPOS --strip-components=1 -xf llvm-project-${LLVM_VERSION}.src.tar.xz && \
    # Generate host headers needed to build clang headers for ${CROSS_COMPILER_TARGET} \
    cd $REPOS/llvm && mkdir build && cd build && \
    $CMAKE_HOST -DLLVM_ENABLE_DOXYGEN=OFF .. && \
    cd $REPOS/clang && mkdir build && cd build && \
    $CMAKE_HOST $CMAKE_LAUNCHERS -DCMAKE_MODULE_PATH="$REPOS/llvm/build/cmake/modules/CMakeFiles;$REPOS/llvm/build/lib/cmake/llvm/" -DLLVM_ENABLE_LIBCXX:BOOL=ON -DLLVM_DIR="$REPOS/llvm" .. && \
    make install-clang-resource-headers && \
    # Generate and install sysroot libc++ headers \
    cd $REPOS/libcxx && mkdir build && cd build && \
    $CMAKE_CROSS $CMAKE_LAUNCHERS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DCMAKE_C_IMPLICIT_LINK_DIRECTORIES= -DCMAKE_CXX_IMPLICIT_LINK_DIRECTORIES= -DLIBCXX_LINK_FLAGS=-fuse-ld=lld -DLIBCXX_GCC_TOOLCHAIN=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl -DLIBCXX_HAS_MUSL_LIBC=1 -DLIBCXX_HAS_GCC_S_LIB=0 -DLIBCXX_CXX_ABI=libcxxabi -DLIBCXX_CXX_ABI_INCLUDE_PATHS="$REPOS/libcxxabi/include" -DLIBCXX_CXX_ABI_LIBRARY_PATH="$REPOS/libcxxabi/build/lib" -DLLVM_PATH="$REPOS/llvm" .. && \
    make cxx_abi_headers generate-cxx-headers install-cxx-headers && \
    # Build and install sysroot compiler-rt \
    cd $REPOS/compiler-rt && mkdir build && cd build && \
    $CMAKE_CROSS $CMAKE_LAUNCHERS -DCMAKE_C_FLAGS="${CMAKE_C_FLAGS}" -DCMAKE_CXX_FLAGS="${CMAKE_CXX_FLAGS}" -DCMAKE_C_IMPLICIT_LINK_DIRECTORIES= -DCMAKE_CXX_IMPLICIT_LINK_DIRECTORIES= -DCOMPILER_RT_BUILD_BUILTINS=ON -DCOMPILER_RT_BUILD_LIBFUZZER=OFF -DCOMPILER_RT_BUILD_MEMPROF=OFF -DCOMPILER_RT_BUILD_PROFILE=OFF -DCOMPILER_RT_BUILD_SANITIZERS=OFF -DCOMPILER_RT_BUILD_XRAY=OFF -DCOMPILER_RT_DEFAULT_TARGET_ONLY=ON -DLLVM_PATH="$REPOS/llvm" .. && \
    make install-builtins && \
    # Finish up musl libc build and install \
    cd /tmp/musl-$MUSL_VERSION && \
    make install && \
    # Build libunwind \
    cd $REPOS/libunwind && mkdir build && cd build && \
    $CMAKE_CROSS $CMAKE_LAUNCHERS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DLIBUNWIND_LINK_FLAGS=-fuse-ld=lld -DCMAKE_LLVM_SYSROOT=${LLVM_SYSROOT} -DLIBUNWIND_GCC_TOOLCHAIN=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl -DLIBUNWIND_ENABLE_SHARED=0 -DLLVM_PATH="$REPOS/llvm" .. && \
    make && \
    # Build and install libcxxabi \
    cd $REPOS/libcxxabi/ && mkdir build && cd build && \
    $CMAKE_CROSS $CMAKE_LAUNCHERS -DCMAKE_C_FLAGS="$CMAKE_C_FLAGS" -DCMAKE_CXX_FLAGS="$CMAKE_CXX_FLAGS" -DLIBCXXABI_HAS_CXA_THREAD_ATEXIT_IMPL=NO -DLIBCXXABI_LINK_FLAGS=-fuse-ld=lld -DLIBCXXABI_GCC_TOOLCHAIN=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl -DCMAKE_SHARED_LINKER_FLAGS="-L$REPOS/libunwind/build/lib" -DLIBCXXABI_USE_LLVM_UNWINDER=1 -DLIBCXXABI_LIBUNWIND_PATH="$REPOS/libunwind" -DLIBCXXABI_LIBCXX_INCLUDES="$REPOS/libcxx/build/include/c++/v1/" -DLLVM_PATH="$REPOS/llvm" .. && \
    make cxxabi_static && \
    make install && \
    # Build and install libc++ \
    cd $REPOS/libcxx/build && \
    make install && \
    cd / && rm -r /tmp/*


## Install static Zlib
ARG ZLIB_VERSION=1.2.13

RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    export MAKEFLAGS="--silent -j $(nproc)" && \
    mkdir -p /tmp/zlib && cd /tmp/zlib && \
    curl -fLO "http://zlib.net/zlib-$ZLIB_VERSION.tar.gz" && \
    tar xzf "zlib-$ZLIB_VERSION.tar.gz" && cd "zlib-$ZLIB_VERSION" && \
    echo "Building zlib" && \
    cd /tmp/zlib/zlib-$ZLIB_VERSION && \
    export CC="$CC_WRAPPER clang --target=${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl" \
    CFLAGS="-nostdinc -isystem $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/" \
    LDSHARED="lld" AR=llvm-ar RANLIB=llvm-ranlib \
    LDFLAGS="-L$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib"; \
    # Legacy path \
    ./configure --static --shared --prefix=/usr/local/musl || cat configure.log && \
    make install && \
    # sysroot \
    ./configure --static --shared --prefix=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl || cat configure.log && \
    make install && \
    sccache --show-stats && \
    rm -r /tmp/zlib


## Install static -fPIC Rocksdb
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    echo "Building rocksdb" && \
    git clone https://github.com/facebook/rocksdb.git --branch v7.4.4 --depth=1 /tmp/rocksdb; \
    cd /tmp/rocksdb && \
    export MAKEFLAGS="--silent -j $(nproc)"; \
    export USE_CLANG=1 TARGET_OS=Linux PORTABLE=1 AR=llvm-ar; \
    export TARGET_ARCHITECTURE=${CROSS_COMPILER_TARGET_ARCH}; \
    export C_INCLUDES="-isystem $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ -isystem $LLVM_SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $LLVM_SYSROOT/usr/include/"; \
    export CC="$CC_WRAPPER clang --target=${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl"; \
    export EXTRA_CFLAGS="-nostdinc -fPIC $C_INCLUDES -nostdlib -nostdlib++ -nodefaultlibs -Wno-unused-command-line-argument"; \
    export CXX="$CC_WRAPPER clang++ -nostdlib++ -fuse-ld=lld --target=${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl"; \
    export EXTRA_CXXFLAGS="-nostdinc -nostdinc++ -fPIC -isystem $LLVM_SYSROOT/usr/include/c++/v1/ -isystem $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ -D _LIBCPP_HAS_MUSL_LIBC $C_INCLUDES -Wno-unused-command-line-argument "; \
    export CFLAGS="$EXTRA_CFLAGS -L$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib"; \
    DISABLE_WARNING_AS_ERROR=1 make static_lib && \
    cp librocksdb.a* $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib && \
    cp -r include/* $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/ && \
    sccache --show-stats && \
    rm -R /tmp/rocksdb/


#############################################################################
## The Cross Compile image
#############################################################################
FROM --platform=${TARGETPLATFORM} ${BASE_IMAGE}

# Copy in the cross compiled cargo tools from base
COPY --from=build /out/tools/* /usr/local/bin/
COPY --from=build /sysroot /sysroot
COPY --from=build /usr/local/musl /usr/local/musl

ARG BUILDARCH
ARG TARGETARCH

ARG CROSS_COMPILER_TARGET_ARCH
ARG SCCACHE_BUCKET
ARG SCCACHE_REGION
ARG SCCACHE_ENDPOINT
ARG SCCACHE_RECACHE
ARG SCCACHE_SERVER_PORT=4226

ARG CROSS_COMPILER_TARGET_ARCH
ENV LLVM_SYSROOT="/sysroot/${CROSS_COMPILER_TARGET_ARCH}-musl"
ENV MUSL_TRIPLE="${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl"

ENV RUSTC_WRAPPER="/usr/local/bin/sccache"
ENV CC_WRAPPER="/usr/local/bin/sccache"

# Copy files around to ensure changes are compatible with agent 3.3 and 3.4
RUN mkdir -p /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/include && \
    mkdir -p /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib && \
    cp $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib/librocksdb.a* /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib && \
    cp -r $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/rocksdb/ /usr/local/rocksdb/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/include/ && \
    cp -r $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/include/rocksdb/ /usr/include/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/ && \
    cp -r $LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl /usr/local/${CROSS_COMPILER_TARGET_ARCH}-linux-musl && \
    cp -r $LLVM_SYSROOT/usr/lib/* /usr/local/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib/ && \
    ln -s /usr/lib/llvm-${LLVM_MAJOR_VERSION}/bin/llvm-strip /usr/local/bin/${CROSS_COMPILER_TARGET_ARCH}-linux-gnu-strip && \
    ln -s /usr/lib/llvm-${LLVM_MAJOR_VERSION}/bin/llvm-strip /usr/local/bin/${CROSS_COMPILER_TARGET_ARCH}-linux-musl-strip && \
    # Build a fake libstdc++ from libc++ and libc++abi to work around some rust crate build.rs deficiencies \
    printf "create /usr/local/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib/libstdc++.a\naddlib /usr/local/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib/libc++.a\naddlib /usr/local/${CROSS_COMPILER_TARGET_ARCH}-linux-musl/lib/libc++abi.a\nsave\nend" | llvm-ar -M && \
    printf "create $LLVM_SYSROOT/usr/lib/libstdc++.a\naddlib $LLVM_SYSROOT/usr/lib/libc++.a\naddlib $LLVM_SYSROOT/usr/lib/libc++abi.a\nsave\nend" | llvm-ar -M ;

# Some legacy compat linkers
RUN printf "#!/usr/bin/env bash\nclang -fuse-ld=lld --target=aarch64-unknown-linux-musl \$@" > /usr/local/bin/aarch64-unknown-linux-musl-clang && \
    chmod +x /usr/local/bin/aarch64-unknown-linux-musl-clang && \
    printf "#!/usr/bin/env bash\nclang -fuse-ld=lld --target=x86_64-unknown-linux-musl \$@" > /usr/local/bin/x86_64-unknown-linux-musl-clang && \
    chmod +x /usr/local/bin/x86_64-unknown-linux-musl-clang

ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER="/usr/local/bin/aarch64-unknown-linux-musl-clang"
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER="/usr/local/bin/x86_64-unknown-linux-musl-clang"

ENV XWIN_CACHE_DIR="${CARGO_HOME}/xwin"
ENV XWIN_TOOLKIT_BIN_PATH="/usr/local/bin"
ENV XWIN_VERSION=16

RUN rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl && \
    rustup target add ${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-gnu  && \
    rustup target add ${CROSS_COMPILER_TARGET_ARCH}-pc-windows-msvc  && \
    mkdir -p $XWIN_CACHE_DIR && chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

# Symlink llvm-rc as rc.exe
RUN ln -s /usr/bin/llvm-rc $XWIN_TOOLKIT_BIN_PATH/rc.exe

ENV XDG_CACHE_HOME="${CARGO_HOME}/xwin"

## Set up default cargo env vars for cross compiling
ENV MUSL_C_INCLUDES="-isystem $LLVM_SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $LLVM_SYSROOT/usr/${MUSL_TRIPLE}/include/ -isystem $LLVM_SYSROOT/usr/include/linux/"
ENV MUSL_CXX_INCLUDES="-isystem $LLVM_SYSROOT/usr/include/c++/v1/ -isystem $LLVM_SYSROOT/usr/${MUSL_TRIPLE}/include/ "

ENV COMMON_RUSTFLAGS="-Clinker=clang -Clink-args=-fuse-ld=lld -Lnative=${LLVM_SYSROOT}/usr/lib/"
ENV SHARED_RUSTFLAGS="${COMMON_RUSTFLAGS}"
ENV STATIC_RUSTFLAGS="${COMMON_RUSTFLAGS} -Ctarget-feature=+crt-static -Clink-args=-static \
                      -Clink-args=-nodefaultlibs -Clink-args=-nostdlib -Clink-args=-nostdlib++\
                      -Clink-args=-stdlib=c++ -l static=c++ -l static=c++abi \
                      -Lnative=$LLVM_SYSROOT/usr/${CROSS_COMPILER_TARGET_ARCH}-unknown-linux-musl/lib"

ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="${STATIC_RUSTFLAGS} -Clink-args=--target=aarch64-unknown-linux-musl"
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="${STATIC_RUSTFLAGS} -Clink-args=--target=x86_64-unknown-linux-musl"

ENV CC_aarch64_unknown_linux_musl="clang"
ENV CFLAGS_aarch64_unknown_linux_musl="--target=aarch64-unknown-linux-musl -fuse-ld=lld -static -fPIC -nostdlib -nodefaultlibs -nostdinc -isystem $LLVM_SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $LLVM_SYSROOT/usr/aarch64-unknown-linux-musl/include/ -isystem $LLVM_SYSROOT/usr/include/linux/ -L ${LLVM_SYSROOT}/usr/aarch64-unknown-linux-musl/lib -lc  -L ${LLVM_SYSROOT}/usr/lib/linux/ -lclang_rt.builtins-aarch64"
ENV CXX_aarch64_unknown_linux_musl="clang++"
ENV CXXFLAGS_aarch64_unknown_linux_musl="--target=aarch64-unknown-linux-musl -fuse-ld=lld -nostdinc -static-libstdc++ --stdlib=c++ --rtlib=compiler-rt -nodefaultlibs -nostdinc++ -isystem $LLVM_SYSROOT/usr/include/c++/v1/ -isystem $LLVM_SYSROOT/usr/aarch64-unknown-linux-musl/include/  -isystem $LLVM_SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $LLVM_SYSROOT/usr/aarch64-unknown-linux-musl/include/ -isystem $LLVM_SYSROOT/usr/include/linux/ "

ENV CC_x86_64_unknown_linux_musl="clang"
ENV CFLAGS_x86_64_unknown_linux_musl="--target=x86_64-unknown-linux-musl -fuse-ld=lld -static -fPIC -nostdlib -nodefaultlibs -nostdinc -isystem $LLVM_SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $LLVM_SYSROOT/usr/x86_64-unknown-linux-musl/include/ -isystem $LLVM_SYSROOT/usr/include/linux/ -L ${LLVM_SYSROOT}/usr/x86_64-unknown-linux-musl/lib -lc  -L ${LLVM_SYSROOT}/usr/lib/linux/ -lclang_rt.builtins-x86_64"
ENV CXX_x86_64_unknown_linux_musl="clang++"
ENV CXXFLAGS_x86_64_unknown_linux_musl="--target=x86_64-unknown-linux-musl -fuse-ld=lld -nostdinc -static-libstdc++ --stdlib=c++ --rtlib=compiler-rt -nodefaultlibs -nostdinc++ -isystem $LLVM_SYSROOT/usr/include/c++/v1/ -isystem $LLVM_SYSROOT/usr/x86_64-unknown-linux-musl/include/  -isystem $LLVM_SYSROOT/usr/lib/clang/${LLVM_VERSION}/include/ -isystem $LLVM_SYSROOT/usr/x86_64-unknown-linux-musl/include/ -isystem $LLVM_SYSROOT/usr/include/linux/ "

ENV PCRE2_SYS_STATIC=1
ENV SYSTEMD_LIB_DIR="/lib/${CROSS_COMPILER_TARGET_ARCH}-linux-gnu"

ENV PKG_CONFIG_ALLOW_CROSS=true \
    PKG_CONFIG_ALL_STATIC=true \
    LIBZ_SYS_STATIC=1 \
    PLATFORM_LDFLAGS="-static-libstdc++ -static-libgcc"

CMD ["bash"]
