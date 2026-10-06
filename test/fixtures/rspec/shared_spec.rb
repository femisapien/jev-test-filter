require_relative "support/shared"

RSpec.describe "customized inclusion" do
  it("unrelated example") { expect(true).to eq true }

  it_behaves_like "a shared group" do
    it("custom example") { expect(4).to eq 4 }
  end
end

RSpec.describe "multiline inclusion" do
  it_should_behave_like(
    "a shared group"
  ) do
    it("multiline custom example") { expect(5).to eq 5 }
  end
end

RSpec.describe(
  "included context"
) do
  include_context "a context with examples"
  it("local example") { expect(6).to eq 6 }
end
