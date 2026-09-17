FROM ubuntu:24.04
ENV container=docker
# Only the init system is preinstalled. setup-server.sh must install the app stack.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y systemd systemd-sysv dbus && rm -rf /var/lib/apt/lists/*
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
