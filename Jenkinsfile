library 'magic-butler-catalogue'

pipeline {
  agent none

  options {
    timestamps()
    ansiColor 'xterm'
  }
  triggers {
    issueCommentTrigger('.*test this please.*')
    cron(env.BRANCH_NAME ==~ /\d\.\d/ ? 'H H 1,15 * *' : '')
  }
  environment {
    DOCKER_BUILDKIT='1'
    SCCACHE_BUCKET='logdna-sccache-us-west-2'
    SCCACHE_REGION='us-west-2'
  }
  parameters {
    booleanParam(name: 'PUBLISH_GCR_IMAGE', description: 'Publish docker image to Google Container Registry (GCR)', defaultValue: false)
    booleanParam(name: 'PUBLISH_DOCKER_IMAGE', description: 'Publish docker image to Dockerhub', defaultValue: false)
  }
  stages {
    stage('Validate PR Source') {
      when {
        expression { env.CHANGE_FORK }
        not {
            triggeredBy 'issueCommentCause'
        }
      }
      steps {
        error("A maintainer needs to approve this PR with a comment of '${TRIGGER_STRING}'")
      }
    }

    stage('Build base images for each supported build host platform') {
      matrix {
        axes {
          axis {
            name 'RUSTC_VERSION'
            values 'stable', 'beta'
          }
          axis {
            name 'VARIANT_VERSION'
            values 'buster', 'bullseye'
          }
          // Host architecture of the built image
          axis {
            name 'PLATFORM'
            // Support for x86_64 and arm64 for Mac M1s/AWS graviton devs/builders
            values 'linux/amd64', 'linux/arm64'
          }
        }
        agent {
          node {
            label 'ec2-fleet'
            customWorkspace "docker-images-${BUILD_NUMBER}"
          }
        }
        stages {
          stage('Initilize qemu') {
            steps {
              sh """
                free -h && df -h
                cat /proc/cpuinfo
                # initialize qemu
                docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
              """
            }
          }
          stage('Build platform specific base') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]){
                    sh """
                        echo "[default]" > ${WORKSPACE}/.aws_creds
                        echo 'AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID' >> ${WORKSPACE}/.aws_creds
                        echo 'AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY' >> ${WORKSPACE}/.aws_creds
                    """
                    script {
                        def image_name = generateImageName(
                          name: "rust"
                          , variant_base: "debian"
                          , variant_version: "${VARIANT_VERSION}"
                          , version: "${RUSTC_VERSION}"
                          , image_suffix: "base-${PLATFORM.replaceAll('/','-')}"
                        )

                        buildImage(
                          name: "rust"
                          , variant_base: "debian"
                          , variant_version: "${VARIANT_VERSION}"
                          , version: "${RUSTC_VERSION}"
                          , platform: "${PLATFORM}"
                          , dockerfile: "Dockerfile.base"
                          , image_name: image_name
                          , pull: true
                          , push: true
                          , clean: false
                        )
                    }
                }
            }
            post {
                always {
                    sh "rm ${WORKSPACE}/.aws_creds"
                }
            }
          } // End Build stage
        } // End Build Rust Images stages
      } // End matrix
    } // End Build Rust Images stage
    // Build the images containing the cross compilers targeting actual
    // distribution platforms
    stage('Build CROSS_COMPILER_TARGET_ARCH Specific images on top of PLATFORMs base image') {
      matrix {
        axes {
          axis {
            name 'RUSTC_VERSION'
            values 'stable', 'beta'
          }
          axis {
            name 'VARIANT_VERSION'
            values 'buster', 'bullseye'
          }
          // Target ISA for musl cross comp toolchain and precompiled libs
          axis {
            name 'CROSS_COMPILER_TARGET_ARCH'
            values 'x86_64', 'aarch64'
          }
          // Host architecture of the built image
          axis {
            name 'PLATFORM'
            values 'linux/amd64', 'linux/arm64'
          }
        }
        agent {
          node {
            label 'ec2-fleet'
            customWorkspace "docker-images-${BUILD_NUMBER}"
          }
        }
        stages {
          stage('Initilize qemu') {
            steps {
              sh """
                free -h && df -h
                cat /proc/cpuinfo
                # initialize qemu
                docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
              """
            }
          }
          stage('Build cross compilation image') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]){
                    sh """
                        echo "[default]" > ${WORKSPACE}/.aws_creds
                        echo 'AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID' >> ${WORKSPACE}/.aws_creds
                        echo 'AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY' >> ${WORKSPACE}/.aws_creds
                    """
                    script {
                      def image_name = generateImageName(
                        name: "rust"
                        , variant_base: "debian"
                        , variant_version: "${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , image_suffix: "${CROSS_COMPILER_TARGET_ARCH}-${PLATFORM.replaceAll('/','-')}"
                      )
                      def base_name = generateImageName(
                        name: "rust"
                        , variant_base: "debian"
                        , variant_version: "${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , image_suffix: "base-${PLATFORM.replaceAll('/','-')}"
                      )
                      // GCR image
                      buildImage(
                        name: "rust"
                        , variant_base: "debian"
                        , variant_version: "${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , cross_compiler_target_arch: "${CROSS_COMPILER_TARGET_ARCH}"
                        , platform: "${PLATFORM}"
                        , dockerfile: "Dockerfile"
                        , image_name: image_name
                        , base_name: base_name
                        , pull: true
                        , push: (env.CHANGE_BRANCH  == "main" || env.BRANCH_NAME == "main" || env.PUBLISH_GCR_IMAGE)

                        , clean: false
                      )
                      def docker_name = generateImageName(
                        repo_base: "docker.io/logdna",
                        , name: "build-images"
                        , variant_base: "rust"
                        , variant_version: "rust-${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , image_suffix: "${CROSS_COMPILER_TARGET_ARCH}-${PLATFORM.replaceAll('/','-')}"
                      )
                      // Dockerhub image
                      docker.withRegistry(
                                'https://index.docker.io/v1/',
                                'dockerhub-username-password') {
                            buildImage(
                                repo_base: "docker.io/logdna",
                                , name: "rust"
                                , variant_base: "debian"
                                , variant_version: "${VARIANT_VERSION}"
                                , version: "${RUSTC_VERSION}"
                                , cross_compiler_target_arch: "${CROSS_COMPILER_TARGET_ARCH}"
                                , platform: "${PLATFORM}"
                                , dockerfile: "Dockerfile"
                                , image_name: docker_name
                                , base_name: base_name
                                , push: (env.CHANGE_BRANCH  == "main" || env.BRANCH_NAME == "main" || params.PUBLISH_DOCKER_IMAGE == true)
                            )
                      }
                      try {
                        gcr.clean(base_name)
                        // Hack to work around docker image bug
                        gcr.clean(image_name.replaceFirst("docker.io/", ""))
                      } catch(Exception ex) {
                        println("image already cleaned up");
                      }
                    }
                }
            }
            post {
                always {
                    sh "rm ${WORKSPACE}/.aws_creds"
                }
            }
          } // End Build stage
        } // End Build Rust Images stages
      }
    }
    stage('Create Multi-Arch Manifests/Images') {
      matrix {
        axes {
          axis {
            name 'RUSTC_VERSION'
            values 'stable', 'beta'
          }
          axis {
            name 'VARIANT_VERSION'
            values 'buster', 'bullseye'
          }
          // Target ISA for musl cross comp toolchain and precompiled libs
          axis {
            name 'CROSS_COMPILER_TARGET_ARCH'
            values 'x86_64', 'aarch64'
          }
        }
        agent {
          node {
            label 'ec2-fleet'
            customWorkspace "docker-images-${BUILD_NUMBER}"
          }
        }
        stages {
          stage ('Create GCR Multi Arch Manifest') {
            when {
                expression { return ((env.CHANGE_BRANCH  == "main" || env.BRANCH_NAME == "main" ) || env.PUBLISH_GCR_IMAGE) }
            }
            steps {
              script {
                def gcr_manifest_name = createMultiArchImageManifest(
                    name: "rust"
                    , variant_base: "debian"
                    , variant_version: "${VARIANT_VERSION}"
                    , version: "${RUSTC_VERSION}"
                    , image_suffix: "${CROSS_COMPILER_TARGET_ARCH}"
                    , append_git_sha: !(env.CHANGE_BRANCH  == "main" || env.BRANCH_NAME == "main" )
                    )
                // GCR image
                sh("docker manifest push ${gcr_manifest_name}")
              }
            }
          }
          stage ('Create Docker Hub Multi Arch Manifest') {
            when {
                expression { return ((env.CHANGE_BRANCH  == "main" || env.BRANCH_NAME == "main" ) || env.PUBLISH_DOCKER_IMAGE) }
            }
            steps {
              script {
                def docker_manifest_name = createMultiArchImageManifest(
                    repo_base: "docker.io/logdna",
                    , name: "build-images"
                    , variant_base: "rust"
                    , variant_version: "rust-${VARIANT_VERSION}"
                    , version: "${RUSTC_VERSION}"
                    , image_suffix: "${CROSS_COMPILER_TARGET_ARCH}"
                    , append_git_sha: !(env.CHANGE_BRANCH  == "main" || env.BRANCH_NAME == "main" )
                    )
                // Dockerhub image
                docker.withRegistry('https://index.docker.io/v1/', 'dockerhub-username-password') {
                  sh("docker manifest push ${docker_manifest_name}")
                }
              }
            }
          }
        }
      }
    }
  }
}

def generateImageName(Map config = [:]){
  assert config.name : "Missing config.name"
  assert config.variant_base : "Missing config.variant_base"
  assert config.variant_version : "Missing config.variant_version"
  assert config.version : "Missing config.version"

  def repo_base = config.get("repo_base", "us.gcr.io/logdna-k8s")
  def append_git_sha = config.get("append_git_sha", true)

  def name = ""

  if (config.image_suffix) {
    name = "${repo_base}/${config.name}:${config.variant_version}-1-${config.version}-${config.image_suffix}"
  } else {
    name = "${repo_base}/${config.name}:${config.variant_version}-1-${config.version}"
  }

  // If config.append_git_sha is set to append it so that the image is unique
  if (append_git_sha) {
    def git_sha = env.GIT_COMMIT
    return "${name}-${git_sha.substring(0, Math.min(git_sha.length(), 16))}"
  } else {
    return name
  }
}

// Build and optionally push image
def buildImage(Map config = [:]) {
  assert config.name : "Missing config.name"
  assert config.variant_base : "Missing config.variant_base"
  assert config.variant_version : "Missing config.variant_version"
  assert config.version : "Missing config.version"

  // PR jobs have CHANGE_BRANCH set correctly
  // branch jobs have BRANCH_NAME set correctly
  // Neither are consistent, so we have to do this :[]
  def shouldPush =  config.get("push", false)
  def directory = "${config.name}/${config.variant_base}"

  List<String> buildArgs = [
    "--progress"
  , "plain"
  ]

  if (env.SCCACHE_BUCKET != null && env.SCCACHE_REGION != null) {
    buildArgs.push("--build-arg")
    buildArgs.push(["SCCACHE_BUCKET", env.SCCACHE_BUCKET].join("="))
    buildArgs.push("--build-arg")
    buildArgs.push(["SCCACHE_REGION", env.SCCACHE_REGION].join("="))
  } else {
    buildArgs.push("--build-arg")
    buildArgs.push("RUSTC_WRAPPER=")
    buildArgs.push("--build-arg")
    buildArgs.push("CC_WRAPPER=")
  }

  if (config.pull) {
    buildArgs.push("--pull")
  }

  if (config.base_name) {
    buildArgs.push("--build-arg")
    buildArgs.push(["BASE_IMAGE", config.base_name].join("="))
  }

  if (config.dockerfile) {
    buildArgs.push("-f")
    buildArgs.push([directory, config.dockerfile].join("/"))
  }

  if (config.cross_compiler_target_arch) {
    buildArgs.push("--build-arg")
    buildArgs.push(["CROSS_COMPILER_TARGET_ARCH", config.cross_compiler_target_arch].join("="))
  }

  if (config.platform) {
    buildArgs.push("--platform")
    buildArgs.push(config.platform)
  }

  buildArgs.push("--secret")
  buildArgs.push("id=aws,src=${env.WORKSPACE}/.aws_creds")

  buildArgs.push("--build-arg")
  buildArgs.push(["VERSION", config.version].join("="))

  buildArgs.push("--build-arg")
  buildArgs.push(["VARIANT_VERSION", config.variant_version].join("="))

  buildArgs.push(directory)

  def image = docker.build(config.image_name, buildArgs.join(' '))

  if (shouldPush) {
    image.push()
  }

  if (config.clean) {
    gcr.clean(image.id)
  }

  return image
}

// Create a multiarch image manifest and push it
def createMultiArchImageManifest(Map config = [:]){
  assert config.name : "Missing config.name"
  assert config.variant_base : "Missing config.variant_base"
  assert config.variant_version : "Missing config.variant_version"
  assert config.version : "Missing config.version"

  def repo_base = config.get("repo_base", "us.gcr.io/logdna-k8s")
  def append_git_sha = config.get("append_git_sha", true)

  def manifest_name = generateImageName(
      repo_base: repo_base
      , name: config.name
      , variant_base: config.variant_base
      , variant_version: config.variant_version
      , version: config.version
      , image_suffix: config.image_suffix
      , append_git_sha: append_git_sha
      )
  def amd64_image_name = generateImageName(
      repo_base: repo_base
      , name: config.name
      , variant_base: config.variant_base
      , variant_version: config.variant_version
      , version: config.version
      , image_suffix: "${config.image_suffix}-linux-amd64"
      , append_git_sha: append_git_sha
      )
  def arm64_image_name = generateImageName(
      repo_base: repo_base
      , name: config.name
      , variant_base: config.variant_base
      , variant_version: config.variant_version
      , version: config.version
      , image_suffix: "${config.image_suffix}-linux-arm64"
      , append_git_sha: append_git_sha
      )
  sh("docker manifest create ${manifest_name} --amend ${arm64_image_name} --amend ${amd64_image_name}")
  return manifest_name
}
