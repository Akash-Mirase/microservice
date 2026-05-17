function analyzeFailure(service, dependencies = []) {

  return {
    rootCause: `${service} overloaded`,
    affectedServices: dependencies,
    confidence: 0.91
  }
}

module.exports = {
  analyzeFailure
}