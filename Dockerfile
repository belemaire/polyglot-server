FROM docker:1.9

# https://github.com/docker/docker/blob/master/project/PACKAGERS.md#runtime-dependencies
RUN apk add --no-cache \
		btrfs-progs \
		e2fsprogs \
		iptables \
		xz  \
		nodejs \
	  python \
	  make \
		g++ \
		&& rm -rf /var/cache/apk/*

# TODO aufs-tools

ENV DIND_COMMIT 3b5fac462d21ca164b3778647420016315289034

RUN wget "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind" -O /usr/local/bin/dind \
	&& chmod +x /usr/local/bin/dind

COPY dockerd-entrypoint.sh /usr/local/bin/

VOLUME /var/lib/docker
EXPOSE 2375

# Define working directory
RUN mkdir -p /src
WORKDIR /src

# Copy all source files
ADD /src /src

# Add polyglot startup script at the root of the container
#ADD polyglot-startup.sh /
RUN npm install
RUN chmod +x index.js

# Expose polyglot server port
EXPOSE 8889

ENTRYPOINT ["dockerd-entrypoint.sh"]
CMD []
