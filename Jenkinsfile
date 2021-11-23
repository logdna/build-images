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
                        echo "[default]" > ${PWD}/.aws_creds
                        echo "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}" >> ${PWD}/.aws_creds
                        echo "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}" >> ${PWD}/.aws_creds
                    """
                    buildImage(
                        dockerfile: "Dockerfile.base"
                        , name: "rust"
                        , variant_base: "debian"
                        , variant_version: "${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , image_suffix: "-base"
                        , pull: true
                        , clean: true
                    )
                }
            }
            post {
                always {
                    sh "rm ${PWD}/.aws_creds"
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
                        echo "[default]" > ${PWD}/.aws_creds
                        echo "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}" >> ${PWD}/.aws_creds
                        echo "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}" >> ${PWD}/.aws_creds
                    """
                    buildImage(
                        dockerfile: "Dockerfile"
                        , base_suffix: "-base",
                        , name: "rust"
                        , variant_base: "debian"
                        , variant_version: "${VARIANT_VERSION}"
                        , version: "${RUSTC_VERSION}"
                        , pull: true
                        , clean: true
                    )
                }
            }
            post {
                always {
                    sh "rm ${PWD}/.aws_creds"
                }
            }
          } // End Build stage
        } // End Build Rust Images stages
      }
    }
  }
}

def buildImage(Map config = [:]) {
  String REPO_BASE = "us.gcr.io/logdna-k8s"
  assert config.name : "Missing config.name"
  assert config.variant_base : "Missing config.variant_base"
  assert config.variant_version : "Missing config.variant_version"
  assert config.version : "Missing config.version"

  def directory = "${config.name}/${config.variant_base}"
  def name

  if (config.base_suffix) {
    name = "${REPO_BASE}/${config.name}:${config.variant_version}-1-${config.version}-${config.base_suffix}"
  } else {
    name = "${REPO_BASE}/${config.name}:${config.variant_version}-1-${config.version}"
  }


  // PR jobs have CHANGE_BRANCH set correctly
  // branch jobs have BRANCH_NAME set correctly
  // Neither are consistent, so we have to do this :[]
  def shouldPush = ((env.CHANGE_BRANCH || env.BRANCH_NAME) == "main")

  List<String> buildArgs = [
    "--progress"
  , "plain"
  ]

  if (config.pull) {
    buildArgs.push("--pull")
  }

  if (config.base_suffix) {
    buildArgs.push("--build-arg")
    buildArgs.push(["BASE_IMAGE", "${REPO_BASE}/${config.name}:${config.base_name}-1-${config.version}-${config.base_suffix}"].join("="))
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

  def image = docker.build(name, buildArgs.join(' '))

  if (shouldPush) {
    image.push()
  }

  if (config.clean) {
    gcr.clean(image.id)
  }
}
