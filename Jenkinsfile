library 'magic-butler-catalogue'

pipeline {
  agent none

  options {
    timestamps()
    ansiColor 'xterm'
  }

  stages {
    stage('Build Rust Images') {
      matrix {
        axes {
          axis {
            name 'RUST_VERSION'
            values 'stable', 'beta', '1.42.0'
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
              slackSend tokenCredentialId: 'qa-slack-token', channel: "#qa-jenkins-notifs", message: "sigma uh oh PoC"
              buildImage(
                name: "rust"
              , variant: "buster"
              , version: "${RUST_VERSION}"
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

  buildArgs.push(directory)

  def image = docker.build(name, buildArgs.join(' '))

  if (shouldPush) {
    image.push()
  }

  if (config.clean) {
    gcr.clean(image.id)
  }
}
