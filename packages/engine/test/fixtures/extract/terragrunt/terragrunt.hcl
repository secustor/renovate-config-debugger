terraform {
  source = "github.com/gruntwork-io/terragrunt-infrastructure-modules-example//modules/app?ref=v0.0.3"
}

inputs = {
  instance_count = 3
}
