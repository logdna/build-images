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

    stage('Build Rust Variant Images') {
      matrix {
        axes {
          axis {
            name 'RUSTC_VERSION'
            values 'stable', 'beta', '1.54.0'
          }
          axis {
            name 'VARIANT_VERSION'
            values 'buster', 'bullseye'
          }
        }

        agent {
          node {
            label 'ec2-fleet'
            customWorkspace "docker-images-${BUILD_NUMBER}"
          }
        }
        stages {
          stage('Build') {
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
                          , image_suffix: "base"
                        )

                        buildImage(
                          name: "rust"
                          , variant_base: "debian"
                          , variant_version: "${VARIANT_VERSION}"
                          , version: "${RUSTC_VERSION}"
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
    stage('Build Rust Arch specific Images') {
      matrix {
        axes {
          axis {
            name 'RUSTC_VERSION'
            values 'stable', 'beta', '1.54.0'
          }
          axis {
            name 'VARIANT_VERSION'
            values 'buster', 'bullseye'
          }
          axis {
            name 'ARCH'
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
          stage('Build') {
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
                        , image_suffix: "${ARCH}"
                      )
                      def base_name = generateImageName(
                        name: "rust"
                        , variant_base: "debian"
                        , variant_version: "${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , image_suffix: "base"
                      )
                      // GCR image
                      buildImage(
                        name: "rust"
                        , variant_base: "debian"
                        , variant_version: "${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , dockerfile: "Dockerfile"
                        , image_name: image_name
                        , base_name: base_name
                        , pull: true
                      )
                      def docker_name = generateImageName(
                        repo_base: "docker.io/logdna",
                        , name: "build-images"
                        , variant_base: "rust"
                        , variant_version: "rust-${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , image_suffix: "${ARCH}"
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
                                , image_suffix: "${ARCH}"
                                , dockerfile: "Dockerfile"
                                , image_name: docker_name
                                , base_name: base_name
                                , clean: false
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
  }
}

def generateImageName(Map config = [:]){
  String repo_base = "us.gcr.io/logdna-k8s"
  assert config.name : "Missing config.name"
  assert config.variant_base : "Missing config.variant_base"
  assert config.variant_version : "Missing config.variant_version"
  assert config.version : "Missing config.version"

  if (config.repo_base) {
    repo_base = config.repo_base
  }

  if (config.image_suffix) {
    return "${repo_base}/${config.name}:${config.variant_version}-1-${config.version}-${config.image_suffix}"
  } else {
    return "${repo_base}/${config.name}:${config.variant_version}-1-${config.version}"
  }
}

def buildImage(Map config = [:]) {
  assert config.name : "Missing config.name"
  assert config.variant_base : "Missing config.variant_base"
  assert config.variant_version : "Missing config.variant_version"
  assert config.version : "Missing config.version"

    // PR jobs have CHANGE_BRANCH set correctly
  // branch jobs have BRANCH_NAME set correctly
  // Neither are consistent, so we have to do this :[]
  def shouldPush =  ((env.CHANGE_BRANCH || env.BRANCH_NAME) == "main" || config.push)

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
