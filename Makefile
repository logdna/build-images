
.PHONY:init-qemu
init-qemu: ## register qemu in binfmt on x86_64 hosts
	@set -e
	echo "Host: " && hostname && uname -a && blkid && docker info && echo && free -h && echo && df -h && echo && lscpu && echo
	bash -c "if [ '$(shell uname -m)' = 'x86_64' ]; then \
		if [ ! -f /proc/sys/fs/binfmt_misc/qemu-aarch64 ]; then \
			( \
				flock 201; \
				docker run --rm --privileged multiarch/qemu-user-static --reset -p yes; \
			) 201>/tmp/qemu_binfmt; \
		else \
			echo Skipping qemu init - already applied; \
		fi; \
	else \
		echo Skipping qemu init - non x86_64 host; \
	fi"
