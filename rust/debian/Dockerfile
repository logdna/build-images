ARG ARCH=x86_64
ARG BASE_IMAGE=logdna/build-images/rust-buster-1-stable-base-${ARCH}
FROM ${BASE_IMAGE}

ARG SCCACHE_BUCKET
ARG SCCACHE_REGION
ARG SCCACHE_ENDPOINT
ARG SCCACHE_RECACHE
ARG SCCACHE_SERVER_PORT=4226
ARG AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY

ARG ARCH=x86_64

RUN rustup target add ${ARCH}-unknown-linux-musl && \
    chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

## Install a musl cross compiler for ${ARCH} using musl-cross-make
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
        TARGET=${ARCH}-linux-musl && \
    sccache --show-stats && \
    rm -rf /tmp/musl-cross

RUN echo "[target.${ARCH}-unknown-linux-musl]" >> $CARGO_HOME/config.toml && \
    echo "linker = \"${ARCH}-linux-musl-gcc\"" >> $CARGO_HOME/config.toml

## Set up cargo env vars for cross compiling
ENV CC_${ARCH}_unknown_linux_musl=${ARCH}-linux-musl-gcc \
    CXX_${ARCH}_unknown_linux_musl=${ARCH}-linux-musl-g++

## Install static Zlib
ARG ZLIB_VERSION=1.2.11
RUN --mount=type=secret,id=aws,target=/root/.aws/credentials \
    if [ -z "$SCCACHE_BUCKET" ]; then unset CC_WRAPPER; fi; \
    if [ -z "$SCCACHE_ENDPOINT" ]; then unset SCCACHE_ENDPOINT; fi; \
    echo "Building zlib" && \
    cd /tmp && \
    curl -fLO "http://zlib.net/zlib-$ZLIB_VERSION.tar.gz" && \
    tar xzf "zlib-$ZLIB_VERSION.tar.gz" && cd "zlib-$ZLIB_VERSION" && \
    CC="$CC_WRAPPER ${ARCH}-linux-musl-gcc" ./configure --static --prefix=/usr/local/musl && \
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
    CC="$CC_WRAPPER ${ARCH}-linux-musl-gcc" CXX="$CC_WRAPPER ${ARCH}-linux-musl-g++" \
    make -j$(nproc) static_lib && \
    mkdir -p /usr/local/rocksdb/${ARCH}-linux-musl/lib && \
    mkdir /usr/local/rocksdb/${ARCH}-linux-musl/include && \
    cp librocksdb.a* /usr/local/rocksdb/${ARCH}-linux-musl/lib && \
    cp -r include /usr/local/rocksdb/${ARCH}-linux-musl/ && \
    cp -r include/* /usr/include/${ARCH}-linux-musl/ && \
    sccache --show-stats && \
    rm -R /tmp/rocksdb/

CMD ["bash"]
