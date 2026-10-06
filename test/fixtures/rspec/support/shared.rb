RSpec.shared_examples "a shared group" do
  it("first shared example") { expect(1).to eq 1 }
  it("second shared example") { expect(2).to eq 2 }
end

RSpec.shared_context "a context with examples" do
  it("context example") { expect(3).to eq 3 }
end
