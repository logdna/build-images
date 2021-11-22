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

    stage('Build Rust Images') {
      matrix {
        axes {
          axis {
            name 'RUST_VERSION'
            values 'stable', 'beta', '1.53.0'
          }
          axis {
            name 'DEBIAN_VERSION'
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
              buildImage(
                name: "rust"
              , variant: "${DEBIAN_VERSION}"
              , version: "${RUST_VERSION}"
              , debian_version: "${DEBIAN_VERSION}"
              , pull: true
              , clean: true
              )
            }
          } // End Build stage
        } // End Build Rust Images stages
      } // End matrix
    } // End Build Rust Images stage
  }
}

def buildImage(Map config = [:]) {
  String REPO_BASE = "us.gcr.io/logdna-k8s"
  assert config.name : "Missing config.name"
  assert config.variant : "Missing config.variant"
  assert config.version : "Missing config.version"

  def directory = "${config.name}/${config.variant}"
  def name = "${REPO_BASE}/${config.name}:${config.variant}-1-${config.version}"

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

  buildArgs.push("--build-arg")
  buildArgs.push(["VERSION", config.version].join("="))

  buildArgs.push("--build-arg")
  buildArgs.push(["DEBIAN_VERSION", config.variant].join("="))

  buildArgs.push(directory)

  def image = docker.build(name, buildArgs.join(' '))

  if (shouldPush) {
    image.push()
  }

  if (config.clean) {
    gcr.clean(image.id)
  }
}
