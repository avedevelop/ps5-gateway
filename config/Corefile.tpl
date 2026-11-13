contribute.live-video.net:53 global-contribute.live-video.net:53 {
    bind __PC_IP__
    template IN A {
        answer "{{ .Name }} 60 IN A __PC_IP__"
    }
    template IN AAAA {
        rcode NOERROR
    }
    log
    errors
}

.:53 {
    bind __PC_IP__
    forward . 1.1.1.1 8.8.8.8
    cache 30
    log
    errors
}
