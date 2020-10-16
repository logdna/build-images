FROM buildpack-deps:buster-curl

ENV CARGO_HOME="/opt/rust/cargo"
ENV RUSTUP_HOME="/opt/rust/rustup"
ENV PATH="${CARGO_HOME}/bin:${PATH}"

RUN DEPS='gcc g++ make xz-utils locales libexpat1-dev gettext libz-dev libssl-dev autoconf pkg-config bzip2' \
  && apt-get update \
  && apt-get install -y --no-install-recommends $DEPS \
  && echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen \
  && locale-gen en_US.UTF-8 \
  && /usr/sbin/update-locale LANG=en_US.UTF-8 \
  && apt-get remove --purge autoconf libz-dev libexpat1-dev -y \
  && apt-get autoremove -y \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /usr/share/doc

ENV LANG en_US.UTF-8
ENV LANGUAGE en_US
ENV TERM xterm

ARG VERSION="stable"

RUN curl https://sh.rustup.rs -sSf | \
    sh -s -- -y --default-toolchain $VERSION --component clippy rustfmt --profile minimal --no-modify-path \
    && chmod -R a+rw $RUSTUP_HOME $CARGO_HOME

RUN cargo install cargo-audit

RUN cargo install --git https://github.com/mozilla/sccache --rev 6628e1f70db3d583cb5e79210603ad878de3d315

ENV RUSTC_WRAPPER="/opt/rust/cargo/bin/sccache"

CMD ["bash"]
