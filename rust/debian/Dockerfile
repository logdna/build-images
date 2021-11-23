ARG BASE_IMAGE
FROM ${BASE_IMAGE}

ARG SCCACHE_BUCKET
ENV SCCACHE_BUCKET=${SCCACHE_BUCKET}

ARG SCCACHE_REGION
ENV SCCACHE_REGION=${SCCACHE_REGION}

ARG ARCH=x86_64

RUN rustup target add ${ARCH}-unknown-linux-musl

# Install a musl cross compiler for ${ARCH} using musl-cross-make
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    mkdir /tmp/musl-cross && cd /tmp/musl-cross && \
    curl --retry 3 -sSfL "https://github.com/richfelker/musl-cross-make/archive/v0.9.9.tar.gz" -O &&\
    tar --strip-components=1 -xzf "v0.9.9.tar.gz" && \
    echo "GCC_CONFIG += --enable-default-pie" >> config.mak && \
    echo 'COMMON_CONFIG="CC=$(CC_WRAPPER) $(CC)"' >> config.mak && \
    echo 'COMMON_CONFIG += "CXX=$(CC_WRAPPER) $(CXX)"' >> config.mak && \
    make install "-j$(nproc)" \
        CC_WRAPPER=$CC_WRAPPER \
        DL_CMD='curl --retry 3 -sSfL -C - -o' \
        LINUX_HEADERS_SITE=https://ci-mirrors.rust-lang.org/rustc/sabotage-linux-tarballs \
        OUTPUT=/usr/local/ \
        TARGET=${ARCH}-linux-musl && \
    rm -rf /tmp/musl-cross && \
    sccache --show-stats

# Set up cargo env vars for cross compiling
ENV CARGO_TARGET_${ARCH}_UNKNOWN_LINUX_MUSL_LINKER=${ARCH}-linux-musl-gcc \
    CC_${ARCH}_unknown_linux_musl=${ARCH}-linux-musl-gcc \
    CXX_${ARCH}_unknown_linux_musl=${ARCH}-linux-musl-g++

## Install static Zlib
ARG ZLIB_VERSION=1.2.11
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    echo "Building zlib" && \
    cd /tmp && \
    curl -fLO "http://zlib.net/zlib-$ZLIB_VERSION.tar.gz" && \
    tar xzf "zlib-$ZLIB_VERSION.tar.gz" && cd "zlib-$ZLIB_VERSION" && \
    CC="$CC_WRAPPER ${ARCH}-linux-musl-gcc" ./configure --static --prefix=/usr/local/musl && \
    make && make install && \
    rm -r /tmp/*

ENV PKG_CONFIG_ALLOW_CROSS=true \
    PKG_CONFIG_ALL_STATIC=true \
    LIBZ_SYS_STATIC=1 \
    PLATFORM_LDFLAGS="-static-libstdc++ -static-libgcc"

# Install static -fPIC Rocksdb
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    echo "Building rocksdb" && \
    cd /tmp && \
    git clone https://github.com/facebook/rocksdb.git && \
    cd rocksdb && \
    git checkout v6.22.1 && \
    PORTABLE=1 CCFLAGS=-fPIC CXXFLAGS=-fPIC \
    CC="$CC_WRAPPER ${ARCH}-linux-musl-gcc" CXX="$CC_WRAPPER ${ARCH}-linux-musl-g++" \
    make static_lib && \
    mkdir -p /usr/local/rocksdb/${ARCH}-linux-musl/lib && \
    mkdir /usr/local/rocksdb/${ARCH}-linux-musl/include && \
    cp librocksdb.a* /usr/local/rocksdb/${ARCH}-linux-musl/lib && \
    cp -r include /usr/local/rocksdb/${ARCH}-linux-musl/ && \
    cp -r include/* /usr/include/${ARCH}-linux-musl/ && \
    rm -R /tmp/rocksdb/ && \
    sccache --show-stats


CMD ["bash"]